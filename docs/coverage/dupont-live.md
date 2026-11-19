# duPont Registry Live, census of the vendor's new source (Lane F, Nov 19 2026)

Read only. Counts only: no listing text, no seller, no VIN in this file. Eight vendor queries (the cap), one at a time; one production read of the archive and one of vinoverlap (nothing written). Vendor quota after the census: 3,378 of 10,000 left this month. The vendor's public openapi.json (not metered) gave the field list and source key.

## 1. What the feed offers

- **Source key: `dupontregistrylive`** (GET /auctions?source=dupontregistrylive). Not to be confused with `dupontregistry`, the classifieds source in GET /classifieds. Published on the vendor's sources page as "duPont REGISTRY Live" among 20 named auction houses.
- **Sold results: yes, 647 rows.** **Unsold attempts: none** (status=unsold returned a total of 0; that status covers reserve not met, withdrawn, canceled and every other completed outcome). **Live auctions:** the vendor lists the source for GET /auctions/live too (a source filter, and `ending_after`, `ending_before`); I did not spend a query on it (cap reached), so I can't say how many are live now. **Bids:** the bid endpoint returns observed leading bids only, a partial trail, per the vendor.
- **Fields on a sold row** (same schema as every other auction source): price, currency, auction end date and time (precision exact on all 647), mileage and mileage unit, VIN, year, make and model as listed and as the vendor normalizes them, engine, drivetrain, transmission, body style, exterior and interior colour (listed and standard), country, state, seller type, title status, has_reserve, featured image, description and its sections, stats (views, watches, likes, bids, unique bidders).
- **Share of the 647 sold rows carrying each:** price 100%; mileage 100% (all in miles); VIN 100% (596 are 17 characters, 92%; 19 are under 11 characters; 638 distinct VINs); description present 100%; year 100%; body style 99.1%; engine 98.8%; exterior colour 98.0%; country 97.8% (all US); photo 96.8%; **gearbox 28.9% (187)**; drivetrain 15.8%. has_reserve is false on every row (so it says nothing). Seller type: dealer 644, private 3.

## 2. How far back

- **Earliest sale Nov 24 2025, latest Nov 19 2026** (the same day as the census). Total sold rows **647**, all inside the last 12 months.
- Sales per month from the earliest: Nov 2025 9 (from the 24th), Dec 34, Jan 2026 41, Feb 44, Mar 54, Apr 75, May 71, Jun 63, Jul 64, Aug 56, Sep 48, Oct 60, Nov 28 (to the 19th). About 55 a month, 2 a day, over the last 8 months.
- Price: median $218,500, lowest $16,500, highest $12,399,000. Mix: coupe 406, convertible 125, SUV 55, sedan 23, wagon 12, pickup and truck 13. A high end venue, as the median shows.

## 3. Prices: hammer or with the buyer's fee, and the currency

**The feed's price is the hammer, without the buyer's fee, in US dollars (all 647 rows USD).** Checked against three published results:

| Car | Feed price | duPont's published hammer | Published with buyer's premium |
|---|---:|---:|---:|
| 2003 Ferrari Enzo (Jun 16 2026) | $12,399,000 | $12,399,000 | $13,018,950 |
| 2006 Lamborghini Murcielago Roadster (Jun 9 2026) | $855,000 | $855,000 | $897,750 |
| 2003 Saleen S7 (Aug 31 2026) | $900,000 | $900,000 | $945,000 |

All three match the published hammer to the dollar. The published fee is 5 percent in all three (the Enzo shows $619,950 over the hammer, so no $25,000 cap was applied there). One note for Sam: duPont's bidder terms say 5 percent of the winning bid "subject to a $25,000 maximum", while its fees page and the Enzo result show 5 percent with no cap; the results beat the terms. This does not matter to the archive (we store the hammer), only to a seller's fee claim, which product rule 22(d) already forbids us to make.

## 4. Has any duPont Live row landed in our archive, and what the pull needs

**No. Zero rows**, under the slug `dupontregistrylive`, `dupontregistry`, or any title containing duPont (poolrows total 0 for each, since 2025-11-01 and all time). The nightly pull takes the keys of `DISPLAY` in scripts/ingest.js (19 sources, autohunter removed); duPont Live is not in it, so it is never asked for. For Lane B:

1. `scripts/ingest.js` DISPLAY: add `dupontregistrylive: "duPont Registry Live"`. It joins ALL_SOURCES by itself; no other list change is needed for the pull.
2. `lib/_houseComps.js` LABEL_TO_SLUG: add `"dupont registry live": "dupontregistrylive"` (the label to slug bridge, lower case).
3. **Fee rule: none needed.** The feed is already hammer; `hammerUsd` returns the price as is for any source outside HOUSE_SOURCES. Do not add it to HOUSE_SOURCES (that would back out a fee that is not in the price). A decision for Lane B: outside HOUSE_SOURCES, duPont Live sales count as online sales (they count toward the "eight or more online sales" online band rule), although it is a live auction with a house like fee. 
4. Display maps that list venues by name and would show the raw slug until updated: api/_historyData.js, lib/_email.js, lib/onebox.js (the platform label map near line 846), lib/desk/execute.js PLATFORM_DISPLAY, lib/deskV3.js VENUE_SLUGS, lib/ops/depthProbe.js, and the venue lists in api/usageDashboard.js (countrycov and other SRCS arrays). Whether it may be a /sell venue (routable) is a product decision, not a data one.
5. A backfill from Nov 24 2025: 647 rows is 7 queries at 100 a page, so a range backfill (not --delta) is cheap.

## 5. Overlap with our archive from other venues

Of the 638 distinct duPont Live VINs (all within the last 12 months), 620 were long enough to look up (18 were under 11 characters). **101 of the 620 (16.3 percent) already appear in our archive from another venue**: 82 as a sold row, 23 as an unsold attempt, 4 as both; 10 of them have been sold two or more times. (The archive holds no duPont Live rows, so every one of the 101 is another venue.) For the 84 matches with a prior sale and a price on both ends, the median ratio of the duPont Live hammer to the earlier sale is 1.03 (hammer against the earlier venue's hammer, not like for like if that venue stored a fee-inclusive price). So about one duPont Live sale in six is a car we have already seen at another auction.

Search check: no public page touched.
