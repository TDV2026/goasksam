# api/usageDashboard.js: the 86 read-to-empty sites (Lane B, Nov 2 2026, lane-b-archiveread step f)

CAUSE: `(await supabaseSelect(...)) || []` turns a failed read (statement timeout, throttle, abort) into an empty list, so an ops task printed `0` where it should have failed. "Line" is the line in cf53ac91 before this change. Class B (a failure hidden as empty, 81 sites) now reads `mustRows(await ..., "ops <task> L<line>")`, which throws, so the task answers an error. Class A (a harmless default, 5 sites) keeps `|| []` with a `// read-failure-ok: <reason>` marker, which scripts/houseReadCheck.mjs requires.

| Line | Task | Table | Class | Reason |
|---|---|---|---|---|
| 158 | helper | outbound_clicks | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 493 | ocdplan | app_usage_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 540 | modscan | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 1329 | curverify | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 1388 | vinverify | ? | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 1459 | projscan | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 2514 | unknownmake | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 2515 | unknownmake | auction_attempts | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 2534 | attemptkeys | auction_attempts | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 2549 | tzcheck | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 2742 | batch2 | ? | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 2927 | sellthin | partners | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 2963 | memcheck | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 2977 | memcheck | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 3012 | htground | ? | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 3014 | htground | ? | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 3052 | pairgate | canonical_sales | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 3057 | pairgate | sale_aliases | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 3179 | yearrecovery | live_listings | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 3203 | taxprobe | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 3206 | taxprobe | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 3208 | taxprobe | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 3293 | poolsrc | ? | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 3344 | bodyaudit | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 3374 | countrycov | ? | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 3420 | poolrows | ? | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 3898 | depth | app_usage_events | A harmless default | optional by design: a failed read leaves the curated warm list as it was (the try/catch says partners optional) |
| 3899 | depth | app_usage_events | A harmless default | optional by design: a failed read leaves the curated warm list as it was (the try/catch says search history optional) |
| 3994 | partnerread | partners | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 4116 | premium | partners | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 4523 | obdiag | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 4566 | obdiag | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 4770 | vindist | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 4771 | vindist | auction_attempts | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 4817 | descfacts | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 4842 | ingestlog | app_usage_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 4856 | speccache | spec_market_cache | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5030 | vinsamples | live_listings | A harmless default | sample task: prints the rows it got and claims no count |
| 5031 | vinsamples | vin_summary | A harmless default | sample task: prints the rows it got and claims no count |
| 5056 | pageviews | app_usage_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5066 | vindbg | vin_index | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5067 | vindbg | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5068 | vindbg | auction_attempts | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5088 | titleaudit | vin_summary | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5097 | titleaudit | ${table} | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5119 | urlcheck | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5120 | urlcheck | auction_attempts | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5149 | opensearchbudget | app_usage_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5150 | opensearchbudget | app_usage_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5151 | opensearchbudget | app_usage_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5248 | ocdmeter | app_usage_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5253 | ocdmeter | app_usage_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5292 | milesaudit | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5302 | milesaudit | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5311 | reserveaudit | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5336 | provevins | vin_summary | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5343 | provevins | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5348 | provevins | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5369 | relisted | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5370 | relisted | auction_attempts | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5463 | vinidxcount | vin_summary | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5465 | vinidxcount | vin_index | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5549 | livegearbox | live_listings | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5569 | vinidentitydry | vin_summary | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5574 | vinidentitydry | vin_index | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5640 | trimwordcount | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5732 | bodychanges | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5747 | getragcount | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 5790 | projdry | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 6139 | buyqueries | analytics_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 6275 | item3probe | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 6277 | item3probe | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 6278 | item3probe | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 6291 | item3probe | sales_archive | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 6396 | trackingproof | funnel_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 6397 | trackingproof | visitor_links | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 6398 | trackingproof | visitor_first_touch | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 6564 | sellexamplerefresh | accounts | A harmless default | label lookup: an unresolved user id prints as the id |
| 6635 | sellexamplerefresh | journeys | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 6640 | sellexamplerefresh | journey_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 6654 | sellexamplerefresh | journey_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 6871 | sellexamplerefresh | funnel_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 6955 | sellexamplerefresh | journeys | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 7227 | sellexamplerefresh | funnel_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 7248 | sellexamplerefresh | app_usage_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
| 7251 | sellexamplerefresh | funnel_events | B failure hidden as empty | the rows feed a count, a verdict or a "found nothing" line; empty from a failed read prints as zero |
