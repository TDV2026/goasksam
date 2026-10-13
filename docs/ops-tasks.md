# api/usageDashboard.js ops tasks (Lane B2, Oct 12 2026)

All tasks sit behind the header credential (`x-ops-key`; an unknown task answers the normal 404).

## The rule applied

- KEEP: referenced by a GitHub workflow, a cron (vercel.json), a script in scripts/, a doc that tells Sam to run it, or the /admin dashboard; and every read-only audit.
- RETIRE: can write to production or spend vendor requests, and is not referenced by any of the above. Removed.
- ASK: write or spend, unreferenced, but may be needed at launch (cache bump, rebuild, partner onboarding, quota view). Kept; Sam decides.
- A code comment that only mentions a task as history (for example lib/_descFacts.js, docs/supabase-url-norm.sql) is not a reference. No GitHub workflow, doc or /admin page calls any retired task. There is no /admin reference to any task.

Read = no write, no vendor request. Write = can change production rows or caches when called. Spend = can use OldCarsData requests.

## Remaining tasks (102)

| task | kind | referenced by | what it is for |
|---|---|---|---|
| status | spend | (none) ASK: see below | spend + budget headroom + OCD's OWN remaining quota (1 metered call reads the live rate-limit header), so we can tell if OCD itsel |
| ocdplan | read | (none, read-only audit) | Oct 2026, Lane B Job 5): 14-day metered-call breakdown by caller, READ-ONLY, ZERO OCD spend (reads app_usage_events only). |
| modscan | read | (none, read-only audit) | READ-ONLY. |
| specpages911 | read | (none, read-only audit) | READ-ONLY. |
| canonproof | read | (none, read-only audit) | READ-ONLY canonical-layer readiness + the Broad Arrow vs Hagerty VIN merge proof. |
| canonsample | read | (none, read-only audit) | READ-ONLY. |
| canonbuild | read | (none, read-only audit) | run the canonical builder in DRY mode (read-only, NO writes) and report the real dedupe rate / alias split / geography / ambiguous |
| canonvin | read | (none, read-only audit) | READ-ONLY. |
| specinvalidate | write | (none) ASK: see below | WRITES (delete only, never a recompute itself - the next Buy/Tasks read recomputes live via the existing specCore/refreshSpec cach |
| sellshadowdetail | read | (none, read-only audit) | Oct 2026, evidence for Sam's follow-up): raw per-sale rows (platform, date, price, title) behind the picked-route priceBand on BOT |
| sellshadow | read | (none, read-only audit) |  |
| venuecheck | read | (none, read-only audit) |  |
| trimresolvediff | read | (none, read-only audit) |  |
| drawervscard | read | (none, read-only audit) | READ-ONLY, zero writes. |
| resolvediff | read | (none, read-only audit) | READ-ONLY, zero writes. |
| referencefiguretable | read | (none, read-only audit) | READ-ONLY, zero writes. |
| obcheck | read | (none, read-only audit) | READ-ONLY, zero writes. |
| deskexample | write | (none) ASK: see below | forces a fresh build of the Sam Desk (/business) worked example (lib/live/deskExample.js, three year-pinned Porsche 911 generation |
| bizleadlist | read | (none, read-only audit) | READ-ONLY, lists every business_leads row (most recent first) so a real (non-QA-marked) test submission - e.g. |
| ratehits | read | (none, read-only audit) | READ-ONLY debug view of ip_rate_hits (lib/_ceilings.js's shared ledger) for diagnosing the Market Check daily-car-limit proof (Oct |
| resolvecheck | read | (none, read-only audit) | READ-ONLY, zero writes, zero OCD. |
| bodytrimsweep | read | (none, read-only audit) | Oct 2026, Lane B follow-up): proves the resolveVehicle fix for compound trim+body phrases ("1988 Porsche 911 Carrera Targa" droppi |
| enginecheck | read | (none, read-only audit) | READ-ONLY, zero writes, zero OCD. |
| vinhistory | read | scripts/weeklyReport.mjs; docs/weekly-report.md | READ-ONLY (weekly report job 2, Oct 2026). |
| weeklysales | read | scripts/weeklyReport.mjs; docs/weekly-report.md | READ-ONLY (weekly total report job, Oct 2026). |
| canonday | read | (none, read-only audit) |  |
| canonstats | read | (none, read-only audit) |  |
| housecur | read | (none, read-only audit) | READ-ONLY. |
| curverify | read | (none, read-only audit) | READ-ONLY (item 5b, Oct 2026). |
| vinrepeats | read | (none, read-only audit) |  |
| vinverify | read | (none, read-only audit) |  |
| projscan | read | (none, read-only audit) | READ-ONLY (follow-up item 1, Oct 2026). |
| vinaudit | read | (none, read-only audit) | READ-ONLY. |
| specialscount | read | (none, read-only audit) | Oct 2026, Lane B status check): how many live_listings rows carry a special_flag (Singer/RUF/RWB, race car, replica/clone - lib/li |
| fieldcov | read | (none, read-only audit) |  |
| unknownmake | read | (none, read-only audit) | READ-ONLY (archive; ZERO OCD). |
| tzcheck | read | (none, read-only audit) | READ-ONLY. 5 recent BaT sales: stored sale_date vs the OCD raw_record end timestamp, to tell whether sale_date is the auction's LO |
| burn | read | (none, read-only audit) | OCD daily burn from app_usage_events (Supabase read ONLY - no OCD call, no metered spend). |
| reviewfix | read | (none, read-only audit) | READ-ONLY (archive + hammerUsd; NO OCD). #3: transmission-split vs mileage-split median gaps for 928 + 997 (to test "transmission  |
| tencars | read | (none, read-only audit) | READ-ONLY (archive + hammerUsd; NO OCD). |
| nblend | read | docs/onebox-step3-backlog.md | READ-ONLY audit (archive; NO OCD). |
| batch2 | read | (none, read-only audit) | READ-ONLY (archive; NO OCD). |
| srcaudit | read | (none, read-only audit) | READ-ONLY (archive only; ZERO OCD). |
| poolcheck | read | (none, read-only audit) | READ-ONLY (archive; ZERO OCD). |
| httrigger | read | (none, read-only audit) | READ-ONLY (archive; ZERO OCD). |
| sellthin | read | (none, read-only audit) | READ-ONLY (archive + partners; ZERO OCD). |
| memcheck | read | (none, read-only audit) | READ-ONLY (archive; ZERO OCD). |
| htground | read | (none, read-only audit) | READ-ONLY (archive; ZERO OCD). |
| pairgate | read | (none, read-only audit) | READ-ONLY (archive; ZERO OCD). |
| perftrimregress | read | (none, read-only audit) | READ-ONLY regression check for the PERF_TRIMS fix (commit 16eeb27). |
| yearrecovery | read | (none, read-only audit) | read-only. |
| taxprobe | read | (none, read-only audit) | READ-ONLY (archive; ZERO OCD). |
| backtest | read | (none, read-only audit) | READ-ONLY (archive; ZERO OCD). |
| nonsoldverify | read | (none, read-only audit) | READ-ONLY (archive; ZERO OCD). |
| poolsrc | read | (none, read-only audit) | READ-ONLY (archive; ZERO OCD). |
| deskcounts | read | (none, read-only audit) | archive sale count for every dictionary scope member + grouping member (all-time, sold-only). |
| probe | spend | scripts/depthProbe.js |  |
| handles | spend | (none) ASK: see below | verify partner seller handles against LIVE OCD before any fetch. |
| partnerfetch | write+spend | (none) ASK: see below | pull each partner's full sold history (case-corrected handle), persist to vehicle_market_records (rule 5, upsert), and derive the  |
| depth | write+spend | vercel.json cron 08:00 UTC | the STANDING archive-depth job. |
| fill | write+spend | vercel.json cron 12:00 UTC; scripts/fillLadder.js |  |
| partnerread | read | (none, read-only audit) | Oct 2026, Lane B report-only): the CURRENTLY STORED partners.specialties.premium for every partner, read-only, no computation. |
| premium | write | nightly.yml job premium; docs/nightly-workflow.yml |  |
| partnerseed | write | (none) ASK: see below | one-shot upsert of the fifth PowerSeller (Spencer Bailey / SpecWerksLTD), executed server-side with the service-role key (the seed |
| daycount | read | (none, read-only audit) | READ-ONLY (archive; ZERO OCD). |
| recentfetch | spend | (none) ASK: see below | METERED but hard-bounded (<=2 pages = <=2 OCD requests). |
| fxaudit | read | (none, read-only audit) | READ-ONLY (archive + saved_results + cube; ZERO OCD, no writes). |
| obdiag | read | (none, read-only audit) | READ-ONLY (archive; ZERO OCD). |
| eight12scan | read | (none, read-only audit) | READ-ONLY (archive; ZERO OCD, no writes). |
| unkclassify | read | (none, read-only audit) | READ-ONLY DRY RUN (archive; ZERO OCD, NO writes). |
| vtcounts | read | (none, read-only audit) | READ-ONLY. |
| vindist | read | (none, read-only audit) | READ-ONLY. |
| descfacts | write | (none) ASK: see below | resumable backfill of the description-derived columns (stated_mileage, project_flag, desc_facts) for EXISTING rows, using the SAME |
| ingestlog | read | (none, read-only audit) | READ-ONLY. |
| speccache | read | (none, read-only audit) | READ-ONLY. spec_market_cache size + how many specs were refreshed in the last run. |
| transaudit | read | (none, read-only audit) | READ-ONLY. |
| nonroadpreview | read | (none, read-only audit) | READ-ONLY dry run. |
| leadcount | read | (none, read-only audit) | READ-ONLY. |
| vintypeaudit | read | (none, read-only audit) | READ-ONLY. |
| vinsamples | read | (none, read-only audit) | READ-ONLY. |
| pageviews | read | (none, read-only audit) | READ-ONLY. |
| vindbg | read | (none, read-only audit) | READ-ONLY. |
| titleaudit | read | (none, read-only audit) | READ-ONLY. |
| urlcheck | read | (none, read-only audit) | READ-ONLY. |
| urlproof | read | (none, read-only audit) | READ-ONLY. |
| opensearchbudget | read | (none, read-only audit) | Lane C, Oct 2026, cache-first rule): |
| crewcookie | read | (none, read-only audit) | Lane C, Oct 2026): a signed crew cookie value (lib/_crew.js), for our own browser tests only. |
| pickfold | read | (none, read-only audit) | Lane C, Oct 2026): |
| ocdmeter | read | (none, read-only audit) |  |
| milesaudit | read | (none, read-only audit) | READ-ONLY. |
| reserveaudit | read | (none, read-only audit) | READ-ONLY. has_reserve coverage on sales_archive by source and year (sold rows): known (true/false) vs null, so we know where a re |
| provevins | read | (none, read-only audit) | READ-ONLY. |
| relisted | read | (none, read-only audit) | READ-ONLY. |
| vincount | read | (none, read-only audit) | READ-ONLY. |
| buildvinindex | write | (none) ASK: see below | run the VIN index rebuild server-side (DB-only, ZERO OCD), the SAME core the CLI + nightly use (scripts/buildVinIndex.js buildVinI |
| vinidxcount | read | (none, read-only audit) | READ-ONLY. vin_index / vin_summary readiness for Lane C: row counts, distinct VINs, multi-appearance VIN count, and 5 sample multi |
| warmMC | write | scripts/pushCheck.mjs (how to warm); scripts/warmMarketCheck.js is its CLI twin |  |
| descfactscov | read | (none, read-only audit) | READ-ONLY. |
| item3probe | read | (none, read-only audit) | READ-ONLY. |
| trackingproof | read | (none, read-only audit) | Oct 2026, open-search policy Part 1 proof): |
| mcexamplerefresh | write | (none) ASK: see below | force-rebuilds the Market Check landing's cached "An example" band (lib/live/marketCheckExample.js, spec_market_cache key "market- |
| sellexamplerefresh | write | (none) ASK: see below | Lane C, Oct 2026): force-rebuilds the new Sell landing's stored "An example" band (lib/sell/sellExample.js, spec_market_cache key  |

## Counts

read: 86, spend: 4, write: 9, write+spend: 3

## ASK list for Sam (write or spend, unreferenced, may be needed at launch; all still in place)

- **status** (spend): Reads our spend, budget headroom and OCD's own remaining quota (1 metered request). Recommend KEEP: the only live view of the vendor quota.
- **recentfetch** (spend): Fetches a source's most recent sold rows (at most 2 requests) to diagnose an ingest gap. Recommend KEEP while ingest health is watched.
- **handles** (spend): Checks a partner's seller handle against live OCD before any fetch. Recommend KEEP until the partner roster is final, then retire.
- **partnerfetch** (write+spend): Pulls a partner's full sold history into the archive (write + spend); feeds the data_verified premium. Recommend KEEP: needed to onboard any new PowerSeller.
- **partnerseed** (write): Patches partner rows live (activates Spencer, flips coverage). Recommend KEEP until Spencer's two gates are decided.
- **specinvalidate** (write): Deletes spec_market_cache rows for one model so the next visit recomputes (cache bump after an engine fix). Recommend KEEP.
- **mcexamplerefresh** (write): Force-rebuilds the Market Check landing example (cache bump between nightly builds). Recommend KEEP.
- **sellexamplerefresh** (write): Force-rebuilds the Sell landing example. Recommend KEEP.
- **deskexample** (write): Force-rebuilds the Sam Desk worked example. Recommend KEEP.
- **buildvinindex** (write): Rebuilds vin_index and vin_summary server-side, DB only (the nightly job runs the script). Recommend KEEP for a launch-day VIN rebuild.
- **descfacts** (write): Resumable backfill of the description-derived columns after the composer changes. Recommend KEEP.

## Retired Oct 12 2026 (31), each write or spend and unreferenced

Write: bizleadtest, cachewritesafety, futurerows, milesfill, simulatedrawer, specmarkettest, titlefill, transfill, typeall, typemodelunk, unkbackfill, unktriage, urlnorm, usdbackfill, zeromiles.

Spend (and some also write, through the archive persist): coverage, fragscan, histfetch, houserates, liveprobe, modelscan, nonsold, nonsold2, ocdstatus, platformpickaudit, platformpickproof, platformpickreport, sellcutoverdiff, selldiag, sellreal, statsprobe.

