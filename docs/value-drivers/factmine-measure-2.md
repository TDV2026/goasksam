# Fact mining, the second measuring run, miner fm2 (Lane F, Nov 18 2026)

Two factmine calls on production, as ordered: source bringatrailer, sold, window 2025-11-17 to 2026-11-16, limit 25, tokenCap 150000, miner version fm2, one call at a time, p996_carrera first and e46_m3 second. Then one read only factreport per family (top 25). Counts, tokens and the miner's own topic words only: no listing text, no quote, no seller and no listing id is in this file. Nothing has been pushed. No further factmine call was made, and no factmap or factprice call.

Both calls answered in full on the first try, at the order's own limit of 25 (the first run had to drop to 6 and lost an answer).

## Call 1, bringatrailer p996_carrera

| measure | value |
|---|---:|
| listings in the window / in the family / already mined | 427 / 301 / 0 |
| asked, **started**, **done**, **failed**, **not started**, in flight at answer | 25, 25, 25, 0, 0, 0 |
| failed by reason code | none |
| **truncated** (answer cut at the output limit) | 0 |
| skipped for no text | 0 |
| statements kept / dropped | 468 / 96 (17.0 percent of 564) |
| dropped by reason | quote not found 86, malformed line 6, type not in list 3, category not in list 1, polarity not in list 0, duplicate 0, over item cap 0 |
| tokens in / out / total | 34,534 / 17,999 / 52,533 |
| per listing in / out / total | 1,381 / 720 / 2,101 |
| wall time | 61.5 s (62.0 s at the client), stopped: nothing (no cap hit) |
| left unmined in the window | 276 |

24 of the 25 listings carry at least one statement; one listing produced none.

## Call 2, bringatrailer e46_m3

| measure | value |
|---|---:|
| listings in the window / in the family / already mined | 150 / 145 / 0 |
| asked, started, done, failed, not started, in flight at answer | 25, 25, 25, 0, 0, 0 |
| failed by reason code | none |
| truncated | 0 |
| skipped for no text | 0 |
| statements kept / dropped | 472 / 64 (11.9 percent of 536) |
| dropped by reason | quote not found 52, malformed line 8, type not in list 4, category not in list 0, polarity not in list 0, duplicate 0, over item cap 0 |
| tokens in / out / total | 31,514 / 16,900 / 48,414 |
| per listing in / out / total | 1,261 / 676 / 1,937 |
| wall time | 52.8 s (53.1 s at the client), stopped: nothing |
| left unmined in the window | 120 |

25 of 25 listings carry statements.

## Against the first run (fm1)

| | fm1 | fm2 |
|---|---:|---:|
| listings that finished, of those asked | 4 of 6 on e46 (call 1 lost its answer) | 25 of 25 and 25 of 25 |
| output tokens per listing | 3,578 to 3,751 | 676 to 720 (about 80 percent less) |
| model calls ending at the output limit | 3 of 4, and at least 2 of 5 | 0 of 50 (truncated 0 on both) |
| wall time per listing | about 32 s | 2.1 to 2.5 s (five at a time) |
| statements dropped | 4.4 percent (e46, 4 listings) | 11.9 and 17.0 percent |

**The drop share is the one thing that got worse.** 138 of the 160 drops (86 percent) are a quote the miner gave that could not be found in the listing text; the other 22 are malformed lines (14), type outside the list (7) and one category. From counts alone the cause cannot be told (the quote is capped at 60 characters, the compact line format, or the miner paraphrasing). It costs statements, not listings: no listing was lost. Lane D should read a sample of the dropped quotes in process; I did not, because the call returns reason counts, not the text.

## Did any answer get cut off?

No. truncated is 0 and failed is 0 on both calls; 50 of 50 listings finished and none stopped on the token cap (52,533 and 48,414 tokens against a cap of 150,000) or on the time budget (about 60 s against 270 s). The output limit is 1,800 tokens; the average listing used 720 and 676, and the report does not give a maximum, so I cannot say how close the longest listing came, only that none was flagged as hitting it.

## factreport, 25 listings per family, the 25 most common raw topics

The topic map has not been run, so these are the miner's own words, and near duplicates are still counted apart (for example three phrasings of "no accidents on the Carfax" and two spellings of the 18 inch wheels). The order among tied topics is not meaningful on 25 listings. The "listings" column is listings out of 25.

### p996_carrera (25 listings, 468 statements, 405 distinct topics, 24 listings with a statement)

| # | topic | listings | type | polarity |
|---|---|---:|---|---|
| 1 | clean carfax report | 11 | condition_present 7, claim 4 | positive 11 |
| 2 | clean montana title | 7 | condition_present 6, claim 1 | positive 3, neutral 4 |
| 3 | no accidents on carfax | 5 | absence_stated 5 | positive 5 |
| 4 | no accidents reported | 5 | absence_stated 5 | positive 5 |
| 5 | 18 inch turbo-look wheels | 4 | claim 2, condition_present 2 | positive 2, neutral 2 |
| 6 | 18-inch turbo-look wheels | 4 | condition_present 4 | neutral 2, positive 2 |
| 7 | acquired by selling dealer in 2025 | 3 | claim 2, work_done 1 | neutral 3 |
| 8 | ims bearing replaced | 3 | work_done 3 | positive 3 |
| 9 | leather dashboard and door panels | 3 | claim 2, condition_present 1 | positive 3 |
| 10 | no accidents or damage on carfax | 3 | absence_stated 3 | positive 3 |
| 11 | service records present | 3 | claim 1, condition_present 2 | positive 3 |
| 12 | 75k miles on odometer | 2 | condition_present 2 | neutral 2 |
| 13 | 99k miles on odometer | 2 | condition_present 2 | neutral 2 |
| 14 | advanced technic package | 2 | claim 2 | positive 2 |
| 15 | aftermarket head unit installed | 2 | work_done 1, condition_present 1 | neutral 2 |
| 16 | brake fluid flushed | 2 | work_done 2 | positive 2 |
| 17 | clean florida title | 2 | condition_present 2 | positive 2 |
| 18 | clean pennsylvania title | 2 | condition_present 2 | positive 2 |
| 19 | clutch replaced | 2 | work_done 2 | positive 2 |
| 20 | current mileage | 2 | condition_present 2 | neutral 2 |
| 21 | headlamp washers factory option | 2 | condition_present 2 | positive 2 |
| 22 | limited-slip differential | 2 | claim 1, condition_present 1 | positive 2 |
| 23 | no accidents or damage | 2 | absence_stated 2 | positive 2 |
| 24 | oil change performed for sale | 2 | work_done 2 | neutral 1, positive 1 |
| 25 | option sticker present and decoded | 2 | condition_present 2 | positive 2 |

Split over the 79 statements behind these 25 topics (the report gives the split per topic, not over all 468): condition_present 38 (48 percent), claim 15 (19), absence_stated 15 (19), work_done 11 (14); positive 59 (75 percent), neutral 20 (25), negative 0.

### e46_m3 (25 listings, 472 statements, 395 distinct topics, 25 listings with a statement)

| # | topic | listings | type | polarity |
|---|---|---:|---|---|
| 1 | clean carfax report | 13 | condition_present 9, claim 4 | positive 13 |
| 2 | shadowline trim | 8 | condition_present 8 | positive 8 |
| 3 | no accidents on carfax | 7 | absence_stated 7 | positive 7 |
| 4 | cold weather package | 4 | condition_present 2, claim 2 | positive 4 |
| 5 | no accidents or damage on carfax | 4 | absence_stated 4 | positive 4 |
| 6 | window sticker present | 4 | condition_present 4 | positive 4 |
| 7 | acquired by selling dealer in 2025 | 3 | claim 2, work_done 1 | neutral 3 |
| 8 | battery replaced | 3 | work_done 3 | positive 3 |
| 9 | carfax report present | 3 | condition_present 3 | positive 3 |
| 10 | limited-slip differential | 3 | condition_present 3 | positive 3 |
| 11 | low mileage | 3 | condition_present 3 | positive 3 |
| 12 | rod bearings replaced | 3 | work_done 3 | positive 3 |
| 13 | 93k miles | 2 | condition_present 2 | neutral 2 |
| 14 | acquired by seller in 2013 | 2 | claim 2 | neutral 2 |
| 15 | alcantara-wrapped steering wheel with m-color stitching | 2 | condition_present 2 | positive 2 |
| 16 | battery replaced before sale | 2 | work_done 2 | positive 2 |
| 17 | cinnamon nappa leather interior | 2 | condition_present 2 | positive 1, neutral 1 |
| 18 | clean arizona title | 2 | condition_present 2 | positive 2 |
| 19 | clean california title | 2 | condition_present 2 | positive 2 |
| 20 | clean texas title | 2 | condition_present 2 | positive 2 |
| 21 | clean title | 2 | condition_present 2 | positive 2 |
| 22 | current owner purchased 2022 | 2 | condition_present 2 | neutral 2 |
| 23 | dinan ecu tune installed | 2 | work_done 1, condition_present 1 | neutral 2 |
| 24 | double-vanos system upgraded | 2 | work_done 2 | positive 2 |
| 25 | driver's window one-touch up inoperative | 2 | condition_present 2 | negative 2 |

Split over the 84 statements behind these 25 topics: condition_present 51 (61 percent), claim 10 (12), absence_stated 11 (13), work_done 12 (14); positive 70 (83 percent), neutral 12 (14), negative 2 (2).

## Is the equipment problem gone?

**Mostly, not entirely. Judged on the top 25 only, because the report holds no statement level split.**

How I judged, without quoting text: from the topic words alone, a topic counts as equipment or a feature when it names something the car was built or optioned with (a factory fitted item, option package, trim or specification line), as opposed to history, condition, work done, ownership, title or documents. I read the 25 topic words per family against that definition; I did not read any statement or listing.

- p996_carrera: 6 of the 25 topics (the two wheel spellings, leather panels, the Advanced Technic package, headlamp washers, the limited-slip differential), 17 of the 79 statements behind them, **22 percent**.
- e46_m3: 5 of the 25 topics (trim, cold weather package, limited-slip differential, steering wheel, interior leather), 19 of the 84 statements, **23 percent**.
- For comparison, by the same reading, the fm1 top 20 for p996_carrera was mostly equipment (climate control, cruise control, hi-fi, fog lights, spoiler, seat memory, speedometer, sunroof, wheels and similar: about 15 of 20 topics). The head of the list is now Carfax, title, accident and work done, which is the kind of statement that can move a price. condition_present fell from 83 percent of statements to 48 and 61 percent.

What this does not show: the long tail. the topics are nearly all different (405 distinct topics over 468 statements, 395 over 472), so most sit in one or two listings, and I cannot judge those from a top 25. The share of equipment across all statements is not measured; it needs either the topic map or a hand check of a sample of statements in process.

## The projected full run, from the measured per listing figures

**Basis.** Per listing: p996_carrera 1,381 tokens in and 720 out; e46_m3 1,261 in and 676 out (the BaT figures above). Rates are the repo's Sonnet rates in api/_usage.js: $3 per million input, $15 per million output (cache rates are not used by the miner). Counts are the value census (docs/value-drivers/census.csv, lane-f-value-census), the whole archive for the two families across the seven full text sources, sold rows, by calendar year windows (each a legal window).

**Why this is a cap, not a floor, for most of the run:** the figures come from Bring a Trailer text (median about 2,900 to 3,000 characters). Cars & Bids (median 1,000 to 1,600), PCARMarket (2,700), Hagerty (3,400), RM, Sotheby's Motorsport and Hemmings (800 to 2,000) are about equal or shorter, so cost per listing for them is at or below this. 73 percent of the listings are Bring a Trailer.

| group | listings | calls (limit 25, calendar year windows) | tokens | dollars |
|---|---:|---:|---:|---:|
| sold, e46_m3 (BaT 165, C&B 83, RM 11, Hagerty 3, Hemmings 3, Sotheby's Motorsport 2, PCARMarket 1) | 268 | 28 | 519,000 | $3.73 |
| sold, p996_carrera (BaT 1,309, C&B 335, PCARMarket 92, Hagerty 10, RM 8, Hemmings 3, Sotheby's Motorsport 3) | 1,760 | 93 | 3,698,000 | $26.30 |
| **sold total** | **2,028** | **121** | **4,217,000** | **$30.03** |
| unsold attempts, e46_m3 (BaT 38, C&B 23, Hagerty 2) | 63 | 6 | 122,000 | $0.88 |
| unsold attempts, p996_carrera (BaT 75, C&B 7, Hagerty 2) | 84 | 6 | 176,000 | $1.26 |
| **unsold total** (reserve not met plus withdrawn; held for five sources, only the three above hold these families, only since September 2025) | **147** | **12** | **298,000** | **$2.14** |
| **all** | **2,175** | **133** | **4,515,000** | **$32.17** |

The 50 listings mined in this run are already done (the done check skips them), which takes about $0.72 off the sold figure, and the spend of this run was $0.72 ($0.37 and $0.35).

**Wall time.** A listing took 2.1 to 2.5 seconds of wall time inside a call (five at a time). Run straight through, 2,175 listings is about 80 minutes, 133 calls of about a minute. At five calls in parallel: about 16 minutes if every call takes the measured minute or less, at most about 27 minutes (27 rounds of 133 calls at the measured 57 s average) if each call is a full 25.

Three cautions:
1. Five calls in parallel is 25 model calls at once. That was not measured (this run had 5 at once) and I do not know the Anthropic rate limit for the key.
2. Five parallel calls also breaks the standing rule of three heavy reads at once; it needs Sam's say, and the DB writes (listing_mentions, listing_mining_runs) come from five calls at once.
3. The statement drop share is 12 to 17 percent on the quote check, so about 1 statement in 7 of the roughly 40,000 statements this would write (about 18.8 kept a listing) is lost until Lane D looks at it. It does not change the cost.

## What this run wrote

The two factmine calls wrote the miner's own tables only: 940 statements into listing_mentions (468 and 472) and 50 rows into listing_mining_runs, all marked fm2. No other table was written, the old fm1 rows were not touched, and no factmap or factprice was run.

## For Sam and the lanes

- The cut off problem is fixed: no truncated answer, no failure, five times faster, a tenth of the output.
- The equipment problem is largely fixed at the head of the list (about 22 to 23 percent of the top statements are still equipment, down from most); the tail is unmeasured.
- New: 12 to 17 percent of statements are dropped for a quote not found in the listing; Lane D to read why.
- Not yet run: the topic map, which will merge the near duplicate topics (no accidents on carfax, three ways).
- The full run costs about $32 and about 20 minutes at five calls at once; Sam's decision (and the parallel rule).

Search check: no public page touched.
