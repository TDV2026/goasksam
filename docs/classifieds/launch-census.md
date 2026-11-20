# Launch census: dealers and classifieds on Find (Lane F, Nov 20 2026)

Read only, counts only: no seller name, no listing text, no VIN in this file. Dealers and classifieds go public on Find by Sunday Nov 22. Method: the crew API (POST /api/buySearch, crew cookie from the Keychain in process; a first search, then the group "more" pages with the car token, as the page does), the ops report GET /api/pullForSale?report=1&miles=1 (zero vendor queries), and one plain GET per card for the View listing link. No vendor query, no write, one call at a time, no PUSH LOCK open at the start. About 570 buySearch calls in all, none failed (the sampler ran twice: the first run used the wrong filter keys for the "more" pages and returned no extra cards, so it was discarded and redone).

## Verdict per class (pass under 1 percent of the sample, otherwise DECISION NEEDED)

1. DECISION NEEDED: the same car shown as two cards, 44 of 1447 cards (3.0%), 21 groups: 17 groups across classiccars and dupontregistry (36 cards), 3 inside classiccars (6), 1 inside barnfinds (2).
2. DECISION NEEDED: a filler mileage printed on the card, 17 of 1447 (1.2%): classiccars 11 of 737, dupontregistry 5 of 116 (4.3%), classicautomall 1. The values printed are 1,111 (13 cards), 1,234 (3) and 9,999 (1).
3. DECISION NEEDED: last seen over 24 hours ago cannot be measured through either door: the card carries no last seen field and the report has no per card age. What the report does show: every served source's stale poll last ran at 12:10 UTC today, hidden rows 0, lapse allowance 30 hours. A per card read needs one field (last_seen_at) added to the card or the report.
4. DECISION NEEDED: View listing link, 1 of 98 did not answer 200 (1.0%): a 404 on restoreamusclecar. One card is the whole signal; strictly it is not under 1 percent.
5. PASS: card name against the car it carries (year, make, model): 0 of 1447 disagree. One card names no model (gaudinclassic, 1 of its 3 cards).
6. PASS: a location outside the US: 0 of 1447. (154 cards print a city with no state; they cannot be placed from the card.)
7. PASS: no photo: 2 of 1447 (0.1%): restoreamusclecar 1 of 21, driversource 1 of 16 (both sources under 30 cards).
8. PASS: an odd asking price: 8 of 1447 (0.6%), by source classiccars 2 (a $99,999 ask on a pending card; a $2,200 ask against a range of $40,000 to $73,500), restoreamusclecar 3 ($454, $64, $1,499,000 against a range of $38,500 to $64,500), driversource 2 ($22,201,338 and $6,200,000), fusionmotorco 1 ($3,775,000 against $66,000 to $96,500). Overall under 1 percent, but two small dealer sources fail on their own sample (restoreamusclecar 3 of 21, driversource 2 of 16); five of the eight print an ask under $500 or over $5m.
9. PASS: a raw source key printed: 0 of 1447 (every visible card string checked for the 21 source keys and for snake_case words).
10. READ ON EACH CARD (no pass line is defined for it): range 814 (56.3%), on its way 438 (30.3%), none 195 (13.5%). Every sampled dupontregistry card (116 of 116) and barnfinds card (63 of 63) is on its way: the report shows 0 of 13,014 and 0 of 561 live rows with a read; classiccars is 212 of 737 (29%) on its way.

## The sample

- **Ten named searches, every dealer and classified card:** 1965 Ford Mustang (19 dealers, 181 classifieds), 1987 Porsche 911 (1, 17), 1969 Chevrolet Camaro (16, 228), 1990 Mazda Miata (0, 4), 1970 Chevrolet Chevelle (15, 99), 2003 BMW M3 (0, 7), 1995 Toyota Land Cruiser (0, 1), 1957 Chevrolet Bel Air (21, 171), 2015 Porsche 911 (0, 12), 1972 Ford Bronco (1, 17). Each group was read to its end and the cards read equal the engine's own count in all ten (810 distinct cards).
- **Make searches for the spread:** 40 makes (Ford, Chevrolet, Porsche, Mercedes-Benz, BMW, Dodge and 34 more), each read at pages spread evenly through the dealers and classifieds groups, at most 8 cards a source and make, until a source reached 60. 644 distinct cards; the union with the named searches is 1447 distinct cards.
- **Sources:** 17 with live rows (14 dealers, classiccars, dupontregistry, barnfinds; autotraderclassics has 0 live rows and 3 sources are held). Seven sources reached 60 cards from the make searches (classicautomall, grautogallery, streetside, dupontregistry, fusionmotorco, classiccars, barnfinds). The others have fewer live cards or were not reached by the 40 makes; their column is the whole of what I read, and any source under 30 cards is too few to judge on its own.

| source | cards | same car twice | outside US | no photo | odd price | filler miles | read: range / on its way / none |
|---|---:|---:|---:|---:|---:|---:|---|
| autobarnclassiccars | 24 | 0 | 0 | 0 | 0 | 0 | 19 / 1 / 4 |
| barnfinds | 63 | 2 | 0 | 0 | 0 | 0 | 0 / 63 / 0 |
| classicautomall | 68 | 0 | 0 | 0 | 0 | 1 | 48 / 7 / 13 |
| classiccars | 737 | 24 | 0 | 0 | 2 | 11 | 438 / 212 / 87 |
| driversource | 16 | 0 | 0 | 1 | 2 | 0 | 12 / 0 / 4 |
| dupontregistry | 116 | 18 | 0 | 0 | 0 | 5 | 0 / 116 / 0 |
| ellingsonmotorcars | 48 | 0 | 0 | 0 | 0 | 0 | 23 / 4 / 21 |
| fusionmotorco | 61 | 0 | 0 | 0 | 1 | 0 | 46 / 7 / 8 |
| gaudinclassic | 3 | 0 | 0 | 0 | 0 | 0 | 0 / 0 / 3 |
| gpmotorsports | 12 | 0 | 0 | 0 | 0 | 0 | 8 / 0 / 4 |
| grautogallery | 65 | 0 | 0 | 0 | 0 | 0 | 50 / 8 / 7 |
| pjsautoworld | 29 | 0 | 0 | 0 | 0 | 0 | 20 / 3 / 6 |
| restoreamusclecar | 21 | 0 | 0 | 1 | 3 | 0 | 12 / 4 / 5 |
| rkmotors | 36 | 0 | 0 | 0 | 0 | 0 | 27 / 4 / 5 |
| streetside | 89 | 0 | 0 | 0 | 0 | 0 | 65 / 4 / 20 |
| supersportclassics | 22 | 0 | 0 | 0 | 0 | 0 | 17 / 2 / 3 |
| vanguardmotorsales | 37 | 0 | 0 | 0 | 0 | 0 | 29 / 3 / 5 |
| ALL | 1447 | 44 | 0 | 2 | 8 | 17 | 814 / 438 / 195 |

Definitions: same car twice = two card ids sharing the car's year, make, model, asking price, miles and place, or the same photo; odd price = an ask of 0, 1, 99,999 and the like, under $500, over $5m, or more than ten times the high end or under a tenth of the low end of the range printed on its own card; filler mileage = 1,111, 1,234, 9,999, 12,345 and the like (a repeated digit or a counting run of 4 or more digits), not 12 or 0; name against car = the year in the name equals the car's year, and the name carries the car's make or model, and no other make; location outside the US = a state or province code that is not a US state, or a country word.

### Why a read is "none" (195 cards)

| reason in words | cards |
|---|---:|
| Too few sales of this car for a range | 122 |
| The listing does not say which version it is (the engine will not read a range across versions) | 73 |

## 3. Cards that serve an earlier sale line, against the 1,760 of Nov 18

- **Today (the ops report):** vin_history_match 49 live rows, of 985 rows stamped so far, out of 45,898 live rows. By source: streetside 17, grautogallery 14, classicautomall 8, vanguardmotorsales 6, restoreamusclecar 3, autobarnclassiccars 1; classiccars 0 and dupontregistry 0.
- **In the sample:** 9 of 1447 cards carry an earlier sale line (streetside 3, vanguardmotorsales 2, restoreamusclecar 2, classicautomall 1, grautogallery 1).
- **Against 1,760:** the two numbers are not comparable yet. The Nov 18 count was a one off match of every VIN, 1,235 of it from autotraderclassics (no rows now) and 854 from classiccars and 397 from dupontregistry; the stamp that Find reads is still catching up (44,913 live rows not stamped), so classiccars and dupontregistry show none. Of the 985 stamped rows, 49 match (5.0%).

## 4. View listing link, 100 cards across sources

98 distinct cards (6 a source; gaudinclassic has only 3 cards, so 98 not 100), one plain GET each, a second between calls, redirects followed, status counts only: **97 answered 200, 1 did not**: {"restoreamusclecar": {"404": 1}} (a 404, on restoreamusclecar). No other status, no timeout.

## Other figures from the ops report

Live 45,898, resolved 45,062, unresolved 836, hidden 0, gone 244, with a read 19,452. Filler mileage in the stored rows (the engine's own sweep, GET report with miles=1): 720 live rows (1.6%), classiccars 614, dupontregistry 64, classicautomall 13, barnfinds 10, grautogallery 7, streetside 7. The requeue that Lane D built for these rows is not run.

## Limits

- The vendor's own year, make and model are not on the card or in the report; I compared the card's name with the car the card carries, which is the engine's resolved car.
- The sample is a spread, not a random draw: the order within a group is the engine's, and the cards after the first page were read at spread offsets.
- Duplicates are found only when both cards are in the sample (exact for the ten named searches).
- A GET to a dealer's own site is not a vendor query; no body was kept.

Rule: pages and emails compute nothing, everything comes from oneEngineAnswer. (No page or email was touched.)

Class fix: not applicable, no code changed.

Search check: no public page touched.
