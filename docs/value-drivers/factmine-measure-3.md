# Value driver miner, third measuring run, fm4 (Lane F, Nov 19 2026)

Counts only: no listing text, no seller, no VIN, no price. Miner fm4 (live on main, 3dc940dd). Spend cap $5; spent about $1.88 (miner $1.60, coverage $0.02, map $0.26). Sold listings, source Bring a Trailer, window 2025-11-17 to 2026-11-16, limit 25, tokenCap 150000, one call at a time, 25 listings per family (the first 25 the miner took; every one has a sale date in 2025). Calls: factmine x2, factcoverage x2, factmap x2 (limit 300), factreport x4 (top 30 and top 200 per family; read only).

## 1. Per factmine call

| | p996_carrera | e46_m3 |
|---|---:|---:|
| Listings in window / in family | 427 / 301 | 150 / 145 |
| Listings done | 25 | 25 |
| Failed (by reason) | 0 | 0 |
| Truncated (answer cut off) | 0 | 0 |
| Statements kept | 1,484 | 1,185 |
| Statements kept per listing | 59.4 | 47.4 |
| Statements dropped | 102 | 192 |
| Dropped: quote not found | 89 | 177 |
| Dropped: malformed line | 13 | 15 |
| Dropped: any other reason | 0 | 0 |
| Dropped share of statements read | 6.4% | 13.9% |
| Quotes recovered (curly quote, dash, whitespace) | 86 (28, 53, 5) | 26 (26, 0, 0) |
| Tokens in / out | 35,684 / 49,300 | 32,664 / 43,338 |
| Tokens per listing (in plus out) | 3,399 | 3,040 |
| Output tokens per listing (cap 8,000) | 1,972 | 1,734 |
| Dollars (Sonnet $3 in, $15 out per million) | $0.847 | $0.748 |
| Dollars per listing | $0.0339 | $0.0299 |
| Wall time | 132.3 s | 106.7 s |

Against fm2 (same 25 listings of the 996): statements kept per listing rose from 18.7 to 59.4, tokens per listing from 2,101 to 3,399 (1.6 times), dollars per listing from $0.0149 to $0.0339 (2.3 times). Nothing was cut off and no call failed.

Share of statements carrying a stated year, a stated mileage, and proof: the report returns these flags per topic, so I weighted them over the 200 most common topics (909 of 1,484 statements for p996, 854 of 1,185 for e46): **stated year 7.8% (p996) and 8.1% (e46); stated mileage 2.4% and 2.3%**. **Proof: not measured.** The miner stores a proof flag per statement (proof_mentioned) but no existing read (factreport or any ops task) returns it, so I cannot give a share through this door. For Lane D: add the share to factreport.

## 2. Coverage (factcoverage, the second read of sentences the miner left out)

| | p996_carrera | e46_m3 |
|---|---:|---:|
| Listings read | 25 | 25 |
| Sentences | 315 | 320 |
| Sentences mined | 307 | 282 |
| Sentences skipped | 8 (2.5%) | 38 (11.9%) |
| Skipped sentences judged to hold a fact | 8 (100%) | 37 (97.4%) |
| Tokens in / out; dollars | 1,394 / 84; $0.005 | 3,927 / 407; $0.018 |

Kinds judged (the model's two words): p996: interior modifications 2, and one each of bodywork refinished, interior equipment, interior features, interior refresh, repairs done, suspension work. e46: 35 kinds, nearly all one each: service history and service work 4, wheels and tires 2, then single sentences on mileage (delivery, odometer, ownership, rating), title and paperwork (carfax, title status, ownership paperwork), defects (functional issues, window defect, cosmetic flaws, glovebox and interior condition), tune and exhaust, brakes, suspension, drivetrain, speakers, specifications.

**Plainly: yes, the miner is still missing facts.** Almost every sentence it skips states one (8 of 8 and 37 of 38). It misses about 1 sentence in 40 on the 996 and 1 in 8 on the E46. The missed kinds are work done and modifications on the 996, and on the E46 a spread of service history, stated mileage, paperwork and title, small defects and condition, and parts changes. Lane D's rule (more than one in ten skipped sentences judged to hold a fact means fix the prompt before a full run) is met on both samples by that measure. The judgment is the model's, not hand checked, so the 100% may be generous.

## 3. The 30 most common topics (top of the report, equipment included)

Topics are canonical where the map reached them. The one ordered factmap call mapped 300 of 930 raw topics (p996) and 300 of 677 (e46), the most common raw ones; 627 and 376 topics still have no kind and rank by their raw wording. Share of the top 30 that is equipment or option: **p996 19 of 30 (equipment 18, option 1); e46 24 of 30 (equipment 24)**. Across the kinded topics the default set aside (equipment and option) is 530 of 1,484 statements (36%) for p996 and 526 of 1,185 (44%) for e46, and these will rise when the other raw topics are mapped.

### p996_carrera
| # | topic | kind | listings | statements |
|---|---|---|---:|---:|
| 1 | automatic climate control | equipment | 25 | 25 |
| 2 | speedometer | equipment | 25 | 25 |
| 3 | deployable rear spoiler | equipment | 22 | 22 |
| 4 | engine type | other | 21 | 21 |
| 5 | exterior color | other | 21 | 27 |
| 6 | leather-wrapped steering wheel | equipment | 20 | 20 |
| 7 | central tachometer | equipment | 19 | 19 |
| 8 | dual exhaust outlets with polished finishers | equipment | 19 | 19 |
| 9 | fog lights | equipment | 19 | 19 |
| 10 | driver seat position memory | equipment | 17 | 17 |
| 11 | clean carfax report | paperwork | 16 | 16 |
| 12 | cross-drilled rotors | equipment | 15 | 15 |
| 13 | factory torque rating | other | 15 | 15 |
| 14 | odometer reading | condition | 15 | 15 |
| 15 | 18-inch turbo-look wheels | equipment | 14 | 16 |
| 16 | cruise control | equipment | 14 | 14 |
| 17 | factory horsepower rating | other | 14 | 14 |
| 18 | automatic brake differential | equipment | 12 | 13 |
| 19 | clean title | paperwork | 12 | 12 |
| 20 | four-piston porsche brake calipers | equipment | 12 | 12 |
| 21 | no accidents on carfax | history | 12 | 12 |
| 22 | transmission type | other | 12 | 15 |
| 23 | acquired by selling dealer | history | 11 | 11 |
| 24 | six-speed manual transaxle | equipment | 11 | 11 |
| 25 | sunroof | equipment | 11 | 11 |
| 26 | interior color | other | 10 | 10 |
| 27 | porsche stability management | equipment | 10 | 10 |
| 28 | heated mirrors | equipment | 9 | 9 |
| 29 | hi-fi sound system | equipment | 9 | 11 |
| 30 | option code 446 wheel caps with porsche crests | option | 9 | 9 |

### e46_m3
| # | topic | kind | listings | statements |
|---|---|---|---:|---:|
| 1 | automatic climate control | equipment | 23 | 23 |
| 2 | cruise control | equipment | 22 | 22 |
| 3 | tachometer with variable redline | equipment | 22 | 22 |
| 4 | 185 mph speedometer | equipment | 21 | 21 |
| 5 | limited-slip differential | equipment | 21 | 21 |
| 6 | quad exhaust outlets | equipment | 21 | 21 |
| 7 | s54 3 2-liter inline-six engine | equipment | 19 | 20 |
| 8 | coolant temperature gauge | equipment | 18 | 18 |
| 9 | factory rated 333 horsepower | other | 18 | 18 |
| 10 | harman kardon sound system | equipment | 18 | 18 |
| 11 | dynamic stability control | equipment | 17 | 17 |
| 12 | fog lights | equipment | 17 | 17 |
| 13 | four-wheel ventilated disc brakes | equipment | 17 | 17 |
| 14 | oil temperature gauge | equipment | 17 | 17 |
| 15 | fuel level gauge | equipment | 16 | 16 |
| 16 | six-speed manual transmission | equipment | 16 | 16 |
| 17 | xenon headlights | equipment | 16 | 16 |
| 18 | clean carfax no accidents [clean] | history | 15 | 15 |
| 19 | clean title | paperwork | 15 | 15 |
| 20 | heated power-adjustable front sport seats | equipment | 15 | 15 |
| 21 | m-color stitching on steering wheel | equipment | 15 | 15 |
| 22 | factory rated 262 lb-ft torque | other | 14 | 14 |
| 23 | brushed aluminum shadow interior trim | equipment | 13 | 13 |
| 24 | leather-wrapped multifunction steering wheel | equipment | 13 | 13 |
| 25 | rain-sensing windshield wipers | equipment | 13 | 13 |
| 26 | led taillights | equipment | 12 | 12 |
| 27 | bmw business cd stereo | equipment | 11 | 11 |
| 28 | exterior color | other | 11 | 12 |
| 29 | black convertible soft top | equipment | 10 | 11 |
| 30 | odometer reading | condition | 9 | 9 |

Canonical topics: p996 774, e46 531 (many appear once). The top lists are the standard equipment of the car (every 996 has climate control and a speedometer), which is why equipment must be set aside to read value drivers, and why the fm4 miner now captures far more of it than fm2.

## 4. Projected full run: 2,175 listings

The measured miner mean is $0.0319 a listing (50 listings), so **about $69** ($65 at the E46 rate, $74 at the 996 rate). Coverage is $0.0005 a listing, **about $1**. The topic map is a cost the earlier estimate left out: $0.13 for 300 labels ($0.00043 a label). The sample produced 37 (p996) and 27 (e46) raw topics a listing; at that rate with no repeats the full run would map 59,000 to 80,000 labels, up to about $30 (a ceiling; topics repeat, so the real figure is lower, not measured). Total **about $70 to $100**; the $5 cap is far below it. Time: 87 calls of 107 to 133 seconds, about 3 hours one at a time (the same door allows three at once).

Open for Sam or Lane D: the prompt fix (skipped sentences hold facts); proof in factreport; a full run needs many factmap calls because one call leaves most topics unkinded; the quote_not_found drop is 6.4% and 13.9% of statements.

Search check: no public page touched.
