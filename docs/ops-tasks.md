# api/usageDashboard.js ops tasks (generated Oct 12 2026, Lane B2)

Header-credential gated (`x-ops-key`). `W` = can write, `M` = can spend OldCarsData requests, `T` = its own comment still says TEMP. Description is the first sentence of the task's own comment; tasks that share a comment block show an empty or neighbouring description (read the code). `deskgate` is dispatched by a different condition.

| task | W | M | T | what it is for |
|---|---|---|---|---|
| status |  |  |  | spend + budget headroom + OCD's OWN remaining quota (1 metered call reads the live rate-limit header), so we can tell if OCD itself is the w |
| ocdplan | W |  |  | Oct 2026, Lane B Job 5): 14-day metered-call breakdown by caller, READ-ONLY, ZERO OCD spend (reads app_usage_events only). |
| modscan |  |  |  | READ-ONLY. |
| specpages911 |  |  |  | READ-ONLY. |
| canonproof |  |  |  | READ-ONLY canonical-layer readiness + the Broad Arrow vs Hagerty VIN merge proof. |
| canonsample |  |  |  | READ-ONLY. |
| canonbuild | W |  |  | run the canonical builder in DRY mode (read-only, NO writes) and report the real dedupe rate / alias split / geography / ambiguous count ove |
| canonvin |  |  |  | READ-ONLY. |
| specinvalidate |  |  |  | WRITES (delete only, never a recompute itself - the next Buy/Tasks read recomputes live via the existing specCore/refreshSpec cache-miss pat |
| sellreal | W |  |  | Oct 2026, correction): the EARLIER sellshadow/sellshadowdetail tasks called buildAnalysisFromStore - a convenience wrapper written for evalu |
| sellshadowdetail |  |  |  |  |
| sellshadow |  |  |  |  |
| venuecheck |  |  |  |  |
| simulatedrawer |  |  |  |  |
| cachewritesafety | W |  |  | Oct 2026, Lane B follow-up item 2): proves the drawer's opportunistic write-back (api/sellerDecision.js's oneBox branch) can never overwrite |
| trimresolvediff |  |  |  |  |
| drawervscard |  |  |  | READ-ONLY, zero writes. |
| resolvediff |  |  |  | READ-ONLY, zero writes. |
| referencefiguretable |  |  |  | READ-ONLY, zero writes. |
| obcheck |  |  |  | READ-ONLY, zero writes. |
| deskexample | W |  |  | forces a fresh build of the Sam Desk (/business) worked example (lib/live/deskExample.js, three year-pinned Porsche 911 generations through  |
| bizleadlist | W |  |  | READ-ONLY, lists every business_leads row (most recent first) so a real (non-QA-marked) test submission - e.g. |
| ratehits |  |  |  | READ-ONLY debug view of ip_rate_hits (lib/_ceilings.js's shared ledger) for diagnosing the Market Check daily-car-limit proof (Oct 2026). ?k |
| bizleadtest |  |  |  |  |
| resolvecheck |  |  |  | READ-ONLY, zero writes, zero OCD. |
| bodytrimsweep |  |  |  | Oct 2026, Lane B follow-up): proves the resolveVehicle fix for compound trim+body phrases ("1988 Porsche 911 Carrera Targa" dropping Targa e |
| enginecheck |  |  |  | READ-ONLY, zero writes, zero OCD. |
| vinhistory |  |  |  | READ-ONLY (weekly report job 2, Oct 2026). |
| weeklysales |  |  |  | READ-ONLY (weekly total report job, Oct 2026). |
| canonday |  |  |  |  |
| canonstats |  |  |  |  |
| housecur |  |  |  | READ-ONLY. |
| curverify |  |  |  | READ-ONLY (item 5b, Oct 2026). |
| vinrepeats |  |  |  | task=vinverify: |
| vinverify |  |  |  |  |
| projscan |  |  |  | READ-ONLY (follow-up item 1, Oct 2026). |
| vinaudit |  |  |  | READ-ONLY. |
| ocdstatus |  |  |  | READ-ONLY. |
| specialscount |  |  |  | Oct 2026, Lane B status check): how many live_listings rows carry a special_flag (Singer/RUF/RWB, race car, replica/clone - lib/live/special |
| fieldcov |  |  |  |  |
| statsprobe |  |  |  | ONE call — fetch recent UNSOLD auctions for a source and return each record's raw `stats` object verbatim, so we can see whether OCD carries |
| liveprobe |  |  |  | ONE call to GET /auctions/live (limit 100). |
| unknownmake |  |  |  | READ-ONLY (archive; ZERO OCD). |
| tzcheck |  |  |  | READ-ONLY. 5 recent BaT sales: stored sale_date vs the OCD raw_record end timestamp, to tell whether sale_date is the auction's LOCAL (Pacif |
| nonsold |  |  |  | READ-ONLY non-sold data scoping (report-only). |
| nonsold2 | W |  |  | closes the non-sold scoping. (a) relist pair: pull reserve-not-met records, and for each VIN check whether a SOLD record with the same VIN e |
| burn |  |  |  | OCD daily burn from app_usage_events (Supabase read ONLY - no OCD call, no metered spend). |
| reviewfix |  |  |  | READ-ONLY (archive + hammerUsd; NO OCD). #3: transmission-split vs mileage-split median gaps for 928 + 997 (to test "transmission outranks m |
| tencars |  |  |  | READ-ONLY (archive + hammerUsd; NO OCD). |
| nblend |  |  |  | READ-ONLY audit (archive; NO OCD). |
| batch2 |  |  |  | READ-ONLY (archive; NO OCD). |
| srcaudit |  |  |  | READ-ONLY (archive only; ZERO OCD). |
| poolcheck |  |  |  | READ-ONLY (archive; ZERO OCD). |
| httrigger |  |  |  | READ-ONLY (archive; ZERO OCD). |
| sellthin |  |  |  | READ-ONLY (archive + partners; ZERO OCD). |
| memcheck |  |  |  | READ-ONLY (archive; ZERO OCD). |
| htground |  |  |  | READ-ONLY (archive; ZERO OCD). |
| pairgate |  |  |  | READ-ONLY (archive; ZERO OCD). |
| selldiag |  | M |  | LIVE /sell fetch trace (METERED OCD). |
| platformpickreport |  |  |  | side-by-side report for lib/platformPick.js (the shared platform-pick function) - the CURRENT live /sell pick (same fetchRecentRecords+analy |
| platformpickproof |  |  |  | Bucket A proof, READ ONLY - calls fetchRecentRecords exactly as live /sell does (no change to it), reports its per-platform evidenceSales at |
| perftrimregress |  |  |  | READ-ONLY regression check for the PERF_TRIMS fix (commit 16eeb27). |
| yearrecovery |  |  |  | read-only. |
| platformpickaudit |  |  |  | the 40-car dropped-gates audit (flag off, read only - never writes, never touches SELL_PICK_SHARED). |
| sellcutoverdiff |  |  |  | READ-ONLY, NEVER touches SELL_PICK_SHARED (the real env var stays whatever it is - this calls buildSharedAnalysis() and decide() directly, t |
| taxprobe |  |  |  | READ-ONLY (archive; ZERO OCD). |
| backtest |  |  |  | READ-ONLY (archive; ZERO OCD). |
| nonsoldverify |  |  |  | READ-ONLY (archive; ZERO OCD). |
| poolsrc |  |  |  | READ-ONLY (archive; ZERO OCD). |
| coverage |  |  |  | READ-ONLY platform coverage audit (Sep 2026). |
| deskcounts |  |  |  | archive sale count for every dictionary scope member + grouping member (all-time, sold-only). |
| houserates |  |  |  | empirical premium-rate calibration. |
| modelscan |  |  |  | read-only fragmentation diagnostic. |
| fragscan | W |  |  | FREE systematic fragmentation scan across the model catalog. |
| probe |  |  |  |  |
| handles |  |  |  | verify partner seller handles against LIVE OCD before any fetch. |
| partnerfetch | W |  |  | pull each partner's full sold history (case-corrected handle), persist to vehicle_market_records (rule 5, upsert), and derive the distinct m |
| histfetch | W |  |  | the historical comp backfill. |
| depth |  |  |  | the STANDING archive-depth job. |
| fill |  |  |  |  |
| partnerread |  |  |  | Oct 2026, Lane B report-only): the CURRENTLY STORED partners.specialties.premium for every partner, read-only, no computation. |
| premium |  |  |  |  |
| partnerseed | W |  |  | one-shot upsert of the fifth PowerSeller (Spencer Bailey / SpecWerksLTD), executed server-side with the service-role key (the seed cannot be |
| daycount |  |  |  | READ-ONLY (archive; ZERO OCD). |
| recentfetch | W | M |  | METERED but hard-bounded (<=2 pages = <=2 OCD requests). |
| futurerows |  |  |  | READ-ONLY find (ZERO OCD) of any sales_archive row dated AFTER today (a completed sale cannot be). |
| fxaudit |  |  |  | READ-ONLY (archive + saved_results + cube; ZERO OCD, no writes). |
| obdiag |  |  |  | READ-ONLY (archive; ZERO OCD). |
| eight12scan |  |  |  | READ-ONLY (archive; ZERO OCD, no writes). |
| unkclassify |  |  |  | READ-ONLY DRY RUN (archive; ZERO OCD, NO writes). |
| unkbackfill | W |  |  | Fix 5 item 4. |
| typeall | W |  |  | Fix 5 full-typing of the ~284k ALREADY-identified (non-Unknown) rows. |
| vtcounts | W |  |  | READ-ONLY. |
| vindist |  |  |  | READ-ONLY. |
| typemodelunk | W |  |  | Fix 5 tail. |
| descfacts | W |  |  | resumable backfill of the description-derived columns (stated_mileage, project_flag, desc_facts) for EXISTING rows, using the SAME lib/_desc |
| ingestlog | W |  |  | READ-ONLY. |
| milesfill | W |  |  | backfill mileage from the title+description parser (lib/_mileageText.js). |
| titlefill | W |  |  | fill vin_summary (+ vin_index) make/model/year for title-less VINs from the best of sales_archive / auction_attempts / live_listings. |
| speccache |  |  |  | READ-ONLY. spec_market_cache size + how many specs were refreshed in the last run. |
| transaudit |  |  |  | READ-ONLY. |
| transfill | W |  |  | WRITE (write=1). |
| nonroadpreview |  |  |  | READ-ONLY dry run. |
| leadcount |  |  |  | READ-ONLY. |
| vintypeaudit |  |  |  | READ-ONLY. |
| vinsamples |  |  |  | READ-ONLY. |
| pageviews |  |  |  | READ-ONLY. |
| vindbg |  |  |  | READ-ONLY. |
| titleaudit |  |  |  | READ-ONLY. |
| urlcheck |  |  |  | READ-ONLY. |
| urlproof |  |  |  | READ-ONLY. |
| urlnorm | W |  |  | backfill the indexed url_norm column from raw_record url/source_url. |
| zeromiles | W |  |  | backfill mileage 0 -> null on sales_archive (zero is not a mileage). |
| opensearchbudget |  |  |  | Lane C, Oct 2026, cache-first rule): |
| crewcookie |  |  |  | Lane C, Oct 2026): a signed crew cookie value (lib/_crew.js), for our own browser tests only. |
| pickfold |  |  |  | Lane C, Oct 2026): |
| ocdmeter |  |  |  |  |
| milesaudit |  |  |  | READ-ONLY. |
| reserveaudit |  |  |  | READ-ONLY. has_reserve coverage on sales_archive by source and year (sold rows): known (true/false) vs null, so we know where a reserve-hist |
| usdbackfill | W |  |  | backfill sale_price_usd on sales_archive rows that have a sale_price but no sale_price_usd, using the EXISTING FX handling (lib/_fx loadFxRa |
| provevins | W |  |  | READ-ONLY. |
| relisted |  |  |  | READ-ONLY. |
| vincount |  |  |  | READ-ONLY. |
| buildvinindex | W |  |  | run the VIN index rebuild server-side (DB-only, ZERO OCD), the SAME core the CLI + nightly use (scripts/buildVinIndex.js buildVinIndex). ?re |
| specmarkettest |  |  |  | run scripts/buildSpecMarketCache.js's SAME exported function (no second copy), the only way to exercise it against real Supabase from outsid |
| vinidxcount |  |  |  | READ-ONLY. vin_index / vin_summary readiness for Lane C: row counts, distinct VINs, multi-appearance VIN count, and 5 sample multi-appearanc |
| warmMC |  |  |  |  |
| unktriage |  |  |  |  |
| descfactscov | W |  |  | READ-ONLY. |
| item3probe | W |  |  | READ-ONLY. |
| trackingproof |  |  |  | Oct 2026, open-search policy Part 1 proof): |
| mcexamplerefresh | W |  |  | force-rebuilds the Market Check landing's cached "An example" band (lib/live/marketCheckExample.js, spec_market_cache key "market-check/land |
| sellexamplerefresh | W |  |  | Lane C, Oct 2026): force-rebuilds the new Sell landing's stored "An example" band (lib/sell/sellExample.js, spec_market_cache key "sell/land |
