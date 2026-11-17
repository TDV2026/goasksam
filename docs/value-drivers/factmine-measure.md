# Fact mining, the measuring run (Lane F, Nov 17 2026)

Two factmine calls on production, as ordered, to see the real cost before the full run. Source bringatrailer, sold, window 2025-11-17 to 2026-11-16, miner version fm1, model claude-sonnet-4-6. Counts, tokens and the miner's own topic words only: no listing text, no quote, no seller and no listing id is in this file. Nothing has been pushed. No factmap or factprice call was made, and there are no further factmine calls.

## Two things that did not go as ordered

1. **Call 1 (p996_carrera, limit 25) returned no answer.** My client gave up after 290 seconds with no response, so its own counts (listings read, done, failed, dropped) were lost. What is known about it comes from two other sources: the usage log, which holds one entry per model call (4 model calls, 5,505 tokens in and 15,003 out), and the read only factreport, which shows 4 listings with 133 statements written. So 4 listings were mined and 133 statements kept; how many were failed, skipped or dropped in call 1 is not known, and no fifth model call was logged in the remaining two and a half minutes. Cause not established (the function limit is 300 seconds and the four calls took about 2 minutes; why nothing followed is unexplained).
2. **Call 2 (e46_m3) was run at limit 6, not 25.** Call 1 showed that a listing takes about 32 seconds, so 25 listings need about 13 minutes against a 300 second function limit: a call of 25 cannot finish. I ran 6 and it answered in 193 seconds. This is a deviation from the order, to get a complete measured answer.

## Call 1, bringatrailer p996_carrera sold (answer lost; from the usage log and factreport)

1. Listings read: not known (no answer). Done: 4 (4 listings carry statements). Failed and skipped: not known.
2. Statements kept: 133. Dropped: not known.
3. tokens_input 5,505, tokens_output 15,003 (4 model calls): 1,376 in and 3,751 out per listing. Three of the four model calls ended at exactly 4,000 output tokens, the miner's output limit (MAX_OUT_TOKENS in lib/factMine.js).

## Call 2, bringatrailer e46_m3 sold (limit 6, answered)

1. Listings in the window 150, in the family 145, already mined 0, asked 6: **done 4, failed 2, skipped for no text 0.** Remaining unmined in this window 139.
2. Statements kept 152; dropped 7. **Dropped share 4.4 percent** (7 of 159). The call returns one dropped total, so the drops for a quote that did not match cannot be told apart from the drops for a category, type or polarity outside the lists; even all 7 as quote mismatches is under one in ten, so on this sample the quote step does not need a prompt change. (The sample is 4 listings.)
3. tokens_input 6,732, tokens_output 21,470 (total 28,202): 1,122 in and 3,578 out per listing asked (6); 1,683 in and 5,368 out per listing that ended done (4). At least two of the logged model calls ended at exactly 4,000 output tokens.

**The finding that matters for a full run:** the miner stops at 4,000 output tokens, and most listings hit it (3 of 4 model calls in call 1; at least 2 of 5 logged in call 2). A listing that hits the limit has an answer cut off mid list: the two failed listings in call 2 fit that, and in call 1 three capped answers were kept. So the cost per listing below is a floor, and the miner loses statements or whole listings on the longest ones. The prompt asks for every statement, and a Bring a Trailer listing holds 30 to 40; the item output (about 100 tokens each) does not fit in 4,000. This needs a decision from Lane B before a full run: a larger output limit, a shorter item (shorter quote), or fewer items.

## factreport, 4 listings per family (counts of the miner's own words; the topic map has not been run, so "canonical" topics here are the raw ones)

The 20 most common topics are mostly ties at 2 to 4 listings out of 4, so the order among them is not meaningful on a sample this small.

### p996_carrera (4 listings, 133 statements, 101 distinct topics)

| # | topic | listings | type | polarity |
|---|---|---:|---|---|
| 1 | automatic climate control | 4 | condition_present | positive |
| 2 | 18 inch turbo-look wheels | 3 | condition_present | positive |
| 3 | clean carfax report | 3 | condition_present | positive |
| 4 | cruise control | 3 | condition_present | positive |
| 5 | deployable rear spoiler | 3 | condition_present | positive |
| 6 | driver seat position memory | 3 | condition_present | positive |
| 7 | exterior color | 3 | condition_present | neutral |
| 8 | factory horsepower rating | 3 | claim | positive |
| 9 | hi-fi sound system | 3 | condition_present | positive |
| 10 | integrated fog lights | 3 | condition_present | positive |
| 11 | 180 mph speedometer | 2 | condition_present | positive/neutral |
| 12 | clean title | 2 | condition_present | positive |
| 13 | dual exhaust with polished finishers | 2 | condition_present | positive |
| 14 | engine type | 2 | condition_present/claim | neutral |
| 15 | interior color and material | 2 | condition_present | neutral/positive |
| 16 | mileage | 2 | condition_present | neutral/positive |
| 17 | no accidents or damage on carfax | 2 | absence_stated | positive |
| 18 | odometer reading | 2 | condition_present | positive/neutral |
| 19 | sunroof | 2 | condition_present | positive |
| 20 | transmission type | 2 | condition_present | positive/neutral |

Split over all 133 statements. Statement type: condition_present 111 (83%), claim 9 (7%), work_done 7 (5%), absence_stated 6 (5%). Polarity: positive 90 (68%), neutral 38 (29%), negative 5 (4%).

### e46_m3 (4 listings, 152 statements, 113 distinct topics)

| # | topic | listings | type | polarity |
|---|---|---:|---|---|
| 1 | automatic climate control | 4 | condition_present | positive |
| 2 | clean carfax report | 4 | condition_present | positive |
| 3 | cruise control | 4 | condition_present | positive |
| 4 | limited-slip differential | 4 | condition_present | positive |
| 5 | quad exhaust outlets | 4 | condition_present | neutral/positive |
| 6 | rain-sensing windshield wipers | 4 | condition_present | positive |
| 7 | dynamic stability control | 3 | condition_present/claim | positive |
| 8 | exterior color | 3 | condition_present | neutral |
| 9 | fog lights | 3 | condition_present | positive |
| 10 | led taillights | 3 | condition_present/work_done | positive/neutral |
| 11 | acquired by selling dealer | 2 | claim | neutral |
| 12 | engine type | 2 | claim/condition_present | neutral |
| 13 | factory horsepower rating | 2 | claim | neutral/positive |
| 14 | harman kardon sound system | 2 | condition_present | positive |
| 15 | left airbag assembly replaced | 2 | work_done | positive/neutral |
| 16 | navigation system | 2 | condition_present | positive |
| 17 | no accidents or damage on carfax | 2 | absence_stated | positive |
| 18 | odometer reading | 2 | condition_present | positive/neutral |
| 19 | oil changed | 2 | work_done | positive |
| 20 | shadowline trim | 2 | condition_present | neutral/positive |

Split over all 152 statements. Statement type: condition_present 105 (69%), work_done 29 (19%), claim 14 (9%), absence_stated 4 (3%). Polarity: positive 93 (61%), neutral 55 (36%), negative 4 (3%).

What the sample shows: the miner mostly lists equipment and condition (climate control, cruise control, sound system, wheels, odometer reading) and almost no negative statements (4 percent, 3 percent). The topics that the pilot is about (a repaint, rod bearings, the IMS bearing) are not among the 20 most common on four listings; that is expected on a sample this small but the full run will be mostly equipment unless the prompt or the later steps put weight on repeated, price relevant statements. (Per statement, the factreport gives type and polarity separately, not as a cross table.)

## Projected cost of the full run

Measured over the 10 model calls (both families): about 1,224 tokens in and 3,647 out per listing, which at the repo's Sonnet rates (3 dollars per million in, 15 per million out, api/_usage.js) is about **$0.058 a listing** (the log shows 0.064 dollars for a call that ended at the 4,000 limit). Lane B's note estimated 2,300 output tokens a listing and about $82 for both families; the measured output is about 3,650 and is capped, so that estimate was low.

| set | listings | cost at $0.058 |
|---|---:|---:|
| Sold, seven full text sources, both families, all years | 2,022 (e46_m3 266, p996_carrera 1,756) | about $118 |
| Unsold attempts with text (bringatrailer, carsandbids, hagerty) | 129 (147 rows, 18 without a description; e46_m3 45, p996_carrera 84) | about $8 |
| **Total first pass** | **2,151** | **about $126** |

Counts are from the Nov 17 census (sold rows with text per source: e46_m3 bringatrailer 165, carsandbids 83, rmsothebys 9, hagerty 3, hemmings 3, sothebysmotorsport 2, pcarmarket 1; p996_carrera bringatrailer 1,309, carsandbids 335, pcarmarket 92, hagerty 10, rmsothebys 4, hemmings 3, sothebysmotorsport 3). Add the topic map (about 0.4 million tokens, about $4 by Lane B's estimate, unmeasured). If the 2 of 6 failures seen in call 2 are retried, add about a fifth: about $150 in all; but a retried listing that hit the output limit will fail again, so the failures are not fixed by retrying. Range $125 to $155 as the miner stands.

**Calls.** At 25 listings a call as ordered: 81 sold and 6 unsold calls (87 in all, more once each source, family and year window is rounded up), but a call of 25 does not fit the 300 second limit. At the 6 that fit in 193 seconds: about 337 sold and 22 unsold calls, 359 in all, each about 3.2 minutes: about 19 hours of calls one after another, or about 6.5 hours three at a time (the heavy read limit). Every call also writes to listing_mentions and listing_mining_runs.

## Stopped

No further factmine call, no factmap, no factprice. Waiting for Sam on: (1) the output limit and the item size (above), which decides the cost and whether the long listings can be mined at all; (2) the number of listings per call (6 fits, 25 does not); (3) whether to run the full pass after that.

Search check: no public page touched.
