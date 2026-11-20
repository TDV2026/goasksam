# Value driver miner, fourth measuring run, fm5 (Lane F, Nov 20 2026)

Counts only: no listing text, no seller, no VIN, no price is in this file. Topics are the miner's own short words (our extracted facts in our words). Miner fm5 (live on main since 8586332e). Source Bring a Trailer, sold, window 2025-11-17 to 2026-11-16, 100 listings of the Porsche 996 (p996_carrera) and 100 of the BMW E46 M3 (e46_m3), 25 a call (MAX_LISTINGS is 25), so 4 calls a family, one at a time. The first 25 listings of each family have exactly the sentence totals of measure 3 (315 and 320), which is consistent with being the same listings; not otherwise verified. The E46 window holds 145 family listings, so 45 are still unmined.

**Status of this file.** Parts 1 to 4 and 7 are final. Parts 5 (five real cars, measure 3 against measure 4) and 6 (decision facts against filler) and the verdict (part 8) need the per car read `task=factcar`, which is not on main yet; they are marked PENDING and will be finished when Lane C posts lane-d-factcar live. Nothing was worked around: the ops door's other tasks return counts per topic, never per listing.

## 1. Measure 3 against measure 4, every figure (one table)

Measure 3 = fm4 on 25 listings a family. Measure 4 = fm5 on 100. Dollars at Sonnet $3 in and $15 out per million tokens.

| figure | 996 measure 3 | 996 measure 4 | E46 measure 3 | E46 measure 4 |
|---|---:|---:|---:|---:|
| Listings read | 25 | 100 | 25 | 100 |
| Failed / truncated listings | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| Statements kept | 1,484 | 6,758 | 1,185 | 6,515 |
| Statements per listing | 59.4 | 67.6 | 47.4 | 65.2 |
| Statements per listing, first 25 listings only | 59.4 | 70.6 | 47.4 | 59.4 |
| Statements dropped (any reason) | 102 (6.4% of read) | 225 (3.2%) | 192 (13.9%) | 181 (2.7%) |
| Dropped: quote not found | 89 | 0 (no longer a drop) | 177 | 0 |
| Dropped: malformed line / duplicate | 13 / 0 | 119 / 106 | 15 / 0 | 122 / 59 |
| Kept but quote unmatched (share of kept) | n/a | 209 (3.1%) | n/a | 305 (4.7%) |
| Unmatched by cause: reworded / not in text / too short | n/a | 179 / 30 / 0 | n/a | 293 / 12 / 0 |
| Matched exact / normalised / loose | n/a | 5,897 / 369 / 389 | n/a | 5,714 / 166 / 389 |
| Tokens in / out (per listing) | 35,684 / 49,300 (1,427 / 1,972) | 156,651 / 223,833 (1,567 / 2,238) | 32,664 / 43,338 (1,307 / 1,734) | 152,729 / 209,128 (1,527 / 2,091) |
| Dollars, miner | $0.847 | $3.83 | $0.748 | $3.60 |
| Dollars per listing, miner | $0.0339 | $0.0383 | $0.0299 | $0.0360 |
| Wall time per call (25 listings) | 132.3 s | 132 to 153 s, mean 142 s | 106.7 s | 116 to 148 s, mean 132 s |
| Sentences read by coverage | 315 | 1,247 | 320 | 1,915 |
| Sentences skipped (share) | 8 (2.5%) | 13 (1.0%) | 38 (11.9%) | 144 (7.5%) |
| Skipped, first 25 listings only | 8 of 315 (2.5%) | 2 of 315 (0.6%) | 38 of 320 (11.9%) | 7 of 320 (2.2%) |
| Skipped sentences judged to hold a fact | 8 of 8 (100%) | 8 of 13 (61.5%) | 37 of 38 (97.4%) | 83 of 144 (57.6%) |
| Statements with a stated year | 7.8% (top 200 topics only) | 16.1% (all statements) | 8.1% (top 200 only) | 18.7% (all) |
| Statements with a stated mileage | 2.4% (top 200 only) | 3.7% (all) | 2.3% (top 200 only) | 4.4% (all) |
| Statements with a proof mention | not measured | 9.0% (608 of 6,758) | not measured | 12.0% (781 of 6,515) |
| Raw topics / canonical topics | 930 / 774 | 3,071 / 1,757 | 677 / 531 | 2,977 / 1,901 |
| Topics still without a kind | 627 | 271 | 376 | 574 |
| Coverage plus map dollars | $0.005 + $0.13 (300 labels) | $0.01 + $1.32 | $0.018 + $0.13 | $0.07 + $1.14 |

Reading it plainly:
- **Cost.** The miner costs about 13% more a listing on the 996 and 20% more on the E46. The whole run was **$9.96**: miner $7.42, coverage $0.08, topic map $2.46 (factreport is read only and free). Measure 3's projection for the full 2,175 listings was $70 to $100; at the measured $0.037 a listing the miner part is about $80 (the full topic map would add to that: this run's map cost $2.46 for 200 listings and the map is not finished, see limits).
- **Latency.** Mining: 8 calls, average 137 s, worst 153 s, none near the 270 s budget. Coverage 3 to 8 s a call. Map 170 to 239 s a call (each call stopped on its time budget, not on an error).
- **Failures and truncations.** None. No listing failed, none was cut off, no call stopped early.
- **Statements per listing** rose from 59.4 to 70.6 on the same first 25 996 listings (+19%) and from 47.4 to 59.4 on the E46 (+25%).
- **Lost statements.** Nothing is dropped for a quote that cannot be found any more. The drops left are lines that cannot be read and exact repeats (3.2% and 2.7%). The unmatched statements (3.1% and 4.7%) are kept with no span; 86% and 96% of them are reworded quotes, so what they state is real but the sentence they came from cannot be marked.
- **Skipped sentences.** On the same first 25 listings the share fell from 2.5% to 0.6% (996) and from 11.9% to 2.2% (E46). Across all 100 the E46 share is 7.5% and it rises call by call (2.2%, 6.7%, 9.8%, 8.9%): the prompt change worked on the measured 25 and not as well on the other 75. Fewer of the skipped sentences are facts (58% to 62% against 97% to 100%), but the E46 count is larger: 83 fact sentences skipped in 100 listings.
- **Statement shares are not on the same basis.** Measure 3's year and mileage shares were weighted over the 200 most common topics; measure 4's are over every statement. The proof share is new.

## 2. Coverage and counts per family

| | 996 | E46 |
|---|---:|---:|
| Listings read (all with at least one statement) | 100 | 100 |
| Statements kept | 6,758 | 6,515 |
| Statements per listing | 67.6 | 65.2 |
| Standard equipment and options set aside by default | 3,586 statements, 577 topics | 2,953 statements, 268 topics |
| Statements left after the default set aside | 3,172 (31.7 a listing) | 3,562 (35.6 a listing) |

### Skipped sentences, ten described by kind (the model's two words; never quoted)

- **996 (13 skipped, 8 judged to hold a fact; all eight):** interior equipment (2), exhaust system, suspension finish, ownership history, service history, damage history, safety equipment (1 each).
- **E46 (144 skipped, 83 judged to hold a fact; the ten commonest kinds):** drivetrain specs (20), parts replaced (7), drivetrain (4), interior equipment (3), service history (3), transmission type (2), service record (2), then single sentences each on subframe reinforcement, title status, window sticker. Most of the E46 skips are specification lines about the drivetrain.

## 3. Coverage by topic

Method: the report returns each topic with its statement count, its listing count and its kind, up to 200 topics a family (the two largest topic lists; they cover 63% and 64% of statements in measure 4 and 61% and 72% in measure 3). I put each of the 200 topics into one group by a stated rule: standard equipment and options by their kind; mileage by "odometer", "mileage" or "miles" in the topic; accident and history by "accident", "damage", "carfax" or "recall"; paint and bodywork by paint, bumper, refinish, scratch, scuff, chip, blemish, curb rash, dent, rust or body words; work done by its kind, into major mechanical work when the topic names the engine, gearbox, clutch, flywheel, differential, IMS or rear main seal (996) or rod bearings, rod bolts, VANOS, subframe, clutch, flywheel, differential or driveline (E46) and routine service otherwise; modifications, paperwork, history and condition by their kind; specification words (horsepower, torque, engine type, transmission type, body style) as options and spec; the rest as presentation and sale details. The groups are mine, not the miner's.

**Read these as floors.** Listings is the count of the single largest topic in the group ("at least"), because the union of listings across topics is not in the report; a group with many small topics (condition, modifications) is under counted, and measure 4 more so than measure 3, because 100 listings spread a topic over more wordings and fewer reach the top 200. The fm5 prompt made one open category in this table: paperwork, title and documents (kind paperwork) and a statement type "other"; the miner's own kinds are equipment, option, work_done, paperwork, history, condition, modification and other.

#### Porsche 996

| topic group | M3 statements (25 listings) | M3 per listing | M3 listings, at least (share) | M4 statements (100 listings) | M4 per listing | M4 listings, at least (share) |
|---|---:|---:|---:|---:|---:|---:|
| Service history (routine work) | 32 | 1.3 | 7 (28%) | 126 | 1.3 | 21 (21%) |
| Major mechanical work | 12 | 0.5 | 6 (24%) | 153 | 1.5 | 40 (40%) |
| Accident and history (reports, damage) | 46 | 1.8 | 16 (64%) | 187 | 1.9 | 68 (68%) |
| Paint and bodywork | 23 | 0.9 | 4 (16%) | 79 | 0.8 | 20 (20%) |
| Modifications | 37 | 1.5 | 5 (20%) | 101 | 1.0 | 20 (20%) |
| Options and spec | 105 | 4.2 | 21 (84%) | 915 | 9.2 | 84 (84%) |
| Ownership and acquisition | 17 | 0.7 | 11 (44%) | 95 | 0.9 | 16 (16%) |
| Condition (wear, tyres, marks) | 4 | 0.2 | 2 (8%) | 0 | 0.0 | 0 (0%) |
| Mileage | 20 | 0.8 | 15 (60%) | 193 | 1.9 | 60 (60%) |
| Paperwork, title and documents | 20 | 0.8 | 12 (48%) | 166 | 1.7 | 51 (51%) |
| Presentation and sale details | 92 | 3.7 | 21 (84%) | 227 | 2.3 | 57 (57%) |
| Standard equipment (set aside by default) | 501 | 20.0 | 25 (100%) | 2022 | 20.2 | 96 (96%) |
| (top 200 topics cover 4264 of 6758 statements, 63%) | | | | | | |

#### BMW E46 M3

| topic group | M3 statements (25 listings) | M3 per listing | M3 listings, at least (share) | M4 statements (100 listings) | M4 per listing | M4 listings, at least (share) |
|---|---:|---:|---:|---:|---:|---:|
| Service history (routine work) | 32 | 1.3 | 5 (20%) | 219 | 2.2 | 36 (36%) |
| Major mechanical work | 10 | 0.4 | 4 (16%) | 127 | 1.3 | 18 (18%) |
| Accident and history (reports, damage) | 54 | 2.2 | 15 (60%) | 210 | 2.1 | 62 (62%) |
| Paint and bodywork | 10 | 0.4 | 2 (8%) | 54 | 0.5 | 11 (11%) |
| Modifications | 40 | 1.6 | 3 (12%) | 123 | 1.2 | 10 (10%) |
| Options and spec | 47 | 1.9 | 18 (72%) | 160 | 1.6 | 53 (53%) |
| Ownership and acquisition | 17 | 0.7 | 6 (24%) | 105 | 1.1 | 19 (19%) |
| Condition (wear, tyres, marks) | 4 | 0.2 | 2 (8%) | 35 | 0.3 | 11 (11%) |
| Mileage | 21 | 0.8 | 9 (36%) | 219 | 2.2 | 89 (89%) |
| Paperwork, title and documents | 29 | 1.2 | 15 (60%) | 212 | 2.1 | 54 (54%) |
| Presentation and sale details | 79 | 3.2 | 11 (44%) | 141 | 1.4 | 59 (59%) |
| Standard equipment (set aside by default) | 511 | 20.4 | 23 (92%) | 2558 | 25.6 | 94 (94%) |
| (top 200 topics cover 4163 of 6515 statements, 64%) | | | | | | |

Model specific issues (a subset of the groups above, not additive): by the largest single wording, **996**: IMS bearing replaced 40 listings (up to 50 with its second wording), clutch replaced 28, rear main seal replaced 17, flywheel replaced 9, water pump replaced 6. **E46**: rod bearings replaced 18 (up to 28 across three wordings), VANOS upgraded or rebuilt 9, 6 and 4 listings under three wordings (up to 19, they may overlap), rear subframe reinforced 6, clutch replaced 9. In measure 3 (25 listings): IMS 6, rear main seal 3, rod bearings 4, VANOS 1 each in five wordings, subframe 0.

## 4. The 30 most common topics, by statements, equipment included

### 996 (100 listings)

| # | topic | kind | statements | listings of 100 |
|---|---|---|---:|---:|
| 1 | automatic climate control | equipment | 102 | 96 |
| 2 | speedometer | equipment | 94 | 94 |
| 3 | deployable rear spoiler | equipment | 93 | 83 |
| 4 | fog lights | equipment | 88 | 78 |
| 5 | driver seat position memory | equipment | 88 | 68 |
| 6 | engine type | other | 87 | 84 |
| 7 | exterior color | other | 86 | 57 |
| 8 | central tachometer | equipment | 80 | 80 |
| 9 | leather-wrapped steering wheel | equipment | 79 | 79 |
| 10 | odometer reading | condition | 78 | 60 |
| 11 | dual exhaust outlets with polished finishers | equipment | 73 | 73 |
| 12 | cruise control | equipment | 72 | 67 |
| 13 | clean carfax report | paperwork | 68 | 68 |
| 14 | six-speed manual transaxle | equipment | 63 | 57 |
| 15 | transmission type | other | 62 | 52 |
| 16 | cross-drilled rotors | equipment | 61 | 61 |
| 17 | 18-inch turbo-look wheels | equipment | 61 | 49 |
| 18 | ims bearing replaced | work_done | 55 | 40 |
| 19 | clean title | paperwork | 51 | 51 |
| 20 | four-piston porsche brake calipers | equipment | 51 | 51 |
| 21 | power-adjustable front seats | equipment | 49 | 45 |
| 22 | sunroof | equipment | 48 | 34 |
| 23 | hi-fi sound system | option | 47 | 34 |
| 24 | xenon headlights | equipment | 47 | 34 |
| 25 | porsche stability management equipped | equipment | 45 | 27 |
| 26 | factory torque rating | other | 43 | 43 |
| 27 | coolant temperature gauge | equipment | 41 | 41 |
| 28 | fuel level gauge | equipment | 41 | 41 |
| 29 | interior color | other | 41 | 41 |
| 30 | oil pressure gauge | equipment | 41 | 41 |

### E46 (100 listings)

| # | topic | kind | statements | listings of 100 |
|---|---|---|---:|---:|
| 1 | odometer reading | condition | 126 | 89 |
| 2 | s54 3 2-liter inline-six engine | equipment | 99 | 82 |
| 3 | tachometer with variable redline | equipment | 94 | 94 |
| 4 | automatic climate control | equipment | 93 | 91 |
| 5 | limited-slip differential | equipment | 93 | 86 |
| 6 | 185 mph speedometer | equipment | 91 | 91 |
| 7 | quad exhaust outlets | equipment | 91 | 91 |
| 8 | cruise control | equipment | 88 | 88 |
| 9 | coolant temperature gauge | equipment | 83 | 83 |
| 10 | fuel level gauge | equipment | 83 | 83 |
| 11 | oil temperature gauge | equipment | 83 | 83 |
| 12 | fog lights | equipment | 80 | 80 |
| 13 | harman kardon sound system | equipment | 79 | 76 |
| 14 | four-wheel ventilated disc brakes | equipment | 72 | 72 |
| 15 | xenon headlights | equipment | 67 | 65 |
| 16 | glass sunroof | equipment | 67 | 40 |
| 17 | leather-wrapped multifunction steering wheel | equipment | 66 | 66 |
| 18 | dynamic stability control | equipment | 63 | 63 |
| 19 | clean carfax no accidents [clean] | history | 62 | 62 |
| 20 | exterior color | other | 61 | 59 |
| 21 | m-color stitching on steering wheel | equipment | 59 | 59 |
| 22 | rain-sensing windshield wipers | equipment | 59 | 59 |
| 23 | heated power-adjustable front sport seats | equipment | 57 | 57 |
| 24 | miles added under current ownership | history | 55 | 51 |
| 25 | clean title | paperwork | 54 | 54 |
| 26 | factory rated 333 horsepower | other | 53 | 53 |
| 27 | exterior color code | equipment | 53 | 47 |
| 28 | six-speed manual transmission | equipment | 50 | 46 |
| 29 | black convertible soft top | equipment | 49 | 36 |
| 30 | transmission type | equipment | 48 | 43 |

Both lists are headed by standard equipment, as in measure 3. 21 of the top 30 are equipment or option on the 996 and 24 of 30 on the E46 (by kind, ordered by statements; measure 3, ordered by listings, was 19 and 24). Some canonical topics repeat under a bracketed variant (for example the carfax clean line appears under three), so the topic counts above are floors for the fact.

## 5. Five real cars per family: measure 3 against measure 4 (PENDING factcar)

Not done. It needs the per listing statement lists (family, year, mileage, sale date, our statements) for the same five listings from run fm4 and run fm5, which only `task=factcar` returns. I will read it with `run=fm5&n=5` then `run=fm4&like=fm5` when Lane C posts it live, write each car's two lists side by side with a one line judgment, and finish part 6 from the same read.

## 6. Decision facts against filler across the 200 listings (PENDING factcar)

Rule I will state when I write it: a statement is a decision fact when it says work done (what, when, at what mileage), damage or an accident, documentation, a drivetrain change, a stated mileage or the car's history of owners and sales; filler when it states colour, wheels and tyres as fitted, photographs, location, reserve status or standard equipment. What the topic table already shows without the per car read: of the 4,264 and 4,163 statements in the top 200 topics, the standard equipment kind alone is 2,022 and 2,558, so roughly half of what is kept is equipment the default set aside already removes; presentation topics (colour, photos, reserve, location, sale details) are another 227 and 141.

## 7. Ten questions GoAskSam can answer from measure 4 (listings that carry the fact, largest single wording, so at least)

Measure 3 could not answer them reliably: either the fact was not extracted at all (0 in the 25 listings), or it was found on so few listings (1 to 6 of 25) that a share of the car population was a guess. At 100 listings a 40% share carries about a 10 point margin either way, against about 19 on 25.

| # | question | family | listings with the fact (of 100) | measure 3 (of 25) |
|---|---|---|---:|---:|
| 1 | Has the IMS bearing been replaced? | 996 | 40 (up to 50 with the second wording) | 6 |
| 2 | Has the clutch been replaced? | 996 / E46 | 28 / 9 | 1 / 2 |
| 3 | Has the rear main seal been replaced? | 996 | 17 | 3 |
| 4 | Have the rod bearings been replaced? | E46 | 18 (up to 28 across three wordings) | 4 |
| 5 | Has the double VANOS been upgraded or rebuilt? | E46 | 9 (up to 19 across three wordings; they may overlap) | 1 per wording |
| 6 | Has the rear subframe been reinforced? | E46 | 6 | 0 |
| 7 | How many miles were added under the current owner? | 996 / E46 | 27 / 51 | 3 / 0 |
| 8 | Do service records come with the car? | 996 / E46 | 29 / 18 | 0 / 3 |
| 9 | Is the window sticker present? | 996 / E46 | 9 / 15 | 0 / 2 |
| 10 | Was the car sold on the platform before? | 996 / E46 | 8 / 5 | 0 / 0 |

Also readable now: oil change and spark plugs replaced (21 and 15 of 100 on the 996, 36 and 17 on the E46), water pump replaced (6 and 10), paint meter readings documented (16 on the 996, 7 on the E46).

## 8. Verdict (PENDING the per car read; what the aggregates show so far)

Provisional, not final: **KEEP** leaning, with one change to test. The miner now reads far more of what a seller states (statements per listing up 19% and 25%, skipped sentences from 2.5% to 0.6% and 11.9% to 2.2% on the same 25 listings, nothing lost for a quote it cannot place), at 13% to 20% more cost a listing, and it answers questions measure 3 could not. The open points are that about half the statements are standard equipment the report already sets aside, and that on the other 75 E46 listings 7.5% of sentences are still skipped, mostly drivetrain specification lines. I will not write the exact prompt change until part 6 shows which filler kinds to drop.

## Limits

- The topic map is not finished: 271 raw topics on the 996 and 577 on the E46 have no canonical topic yet (a read only order, so I did not run another map call). They are the rarest topics and rank last; the coverage groups are floors for that reason too.
- The report shows 200 topics a family, so per group listing counts are lower bounds.
- The groups in part 3 are my rule over topic words, not the miner's kinds.
- Latency is of the call as measured by the client.

Rule: pages and emails compute nothing, everything comes from oneEngineAnswer. (No page or email was touched.)

Class fix: not applicable, no code changed.

Search check: no public page touched.
