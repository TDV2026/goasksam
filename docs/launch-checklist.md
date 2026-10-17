# Launch checklist

Kept by Lane F (the Desk). Docs-only commits, each pushed by itself on top of origin/main. Every row carries an owner,
a state and a proof. States: building, ready, pushing, live, checking, blocked, decision (Sam's call), unknown (asked,
not yet answered). "Proof" names where the evidence sits (a lane-notes section, a script, a screenshot folder); a
row with no proof is not done whatever its state says.

Last updated: 2026-10-17 ~00:12Z (Lane F; demo incident cause found by Lane C: cause (b), the sealed Market Check refused the in-process read for a partner session; fix building).

## 1. The four launch items

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| Market Check matches the mockup | Lane A | checking (zero gaps on the four named cars, Oct 16) | Sam's sign-off on the cited approved differences | lane-notes "Job 1 (Lane A, Sam's four-car mockup check, 2026-10-16)"; ~/Desktop/goasksam-proofs/card/audit-{911,mustang,speedster,275gtb}-{1440,390}.png |
| Every car returns a range | Lane B | building (e59 live; e60 is the last engine bump before launch; 1971 Mercedes-Benz 280SE 3.5 Cabriolet still hits the 20-second deadline card, an e60 item) | e60 push; the e59 four-lane sweep (parked until B2's golden run is DONE) | lane-notes Lane B RUNNING/DONE lines; e59 sweep DONE line when posted |
| Golden table zero mismatches across Market Check, Buy, Sell and Tasks | Lane B2 | ready to restart (stopped run confirmed stopped; runner rebuilt on b2-golden 43b4468d: API mode reads engine answers through keyed enginecheck, pages only for the 25 of 46 rows whose check needs printed text, 120 s per-read deadline marks RE-READ and moves on, progress lines with rows done X of N; --pages mode for the final launch run; rows 1 to 45 pinned, row 46 waits on e60; expected red until others act: rows 32, 37, 38 states-a-body lines and the Buy and Sell shared-card identity (Lane A's card live checks), Sell count rows 8, 10, 14, 22, 23, 39 to 41) | Lane B's demo warm DONE; B2's list of checks moved to the API; Lane A's card live checks; e60 for row 46 | B2's stopped line; DONE with per-product counts; the final launch run renders all 46 pages |
| Sam's own review | Sam | decision | the three rows above | Sam's note in lane-notes |

## 2. Partner demo

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| eBay partner demo (/partner-demo, four views, shared card) | Lane C | INCIDENT, cause found (b): the data endpoint calls Market Check's handler in-process with the visitor's headers; Market Check is sealed before launch (CURTAIN_SEALED, isReleased) and refused a gas_partner session with no crew cookie, so the page drew could-not-read and view d fell to the false no-sales text. Not a cold read (all six demo cars 200 in 0.9 to 4.0 s with the crew cookie at 00:05Z; Lane B: all stored rows present, the 00:00 UTC gate only marked them stale). Lane C's crew-cookie live checks missed it. | the fix push: the in-process read carries the server's own internal credential; FOR LANE B an internal-caller flag in sellerDecision.js would be cleaner | Lane C's live checks on all four views at 1440 and 390 from a partner-code session; Desktop/goasksam-proofs/partner/live/ |
| Demo never prints the no-sales text on a failed read; one automatic retry; demo-path deadline; last good engine answer kept verbatim with readAt, shown under a day old | Lane C | building (Sam's order, after the cause report) | the cause report | the live checks; partnerEngineMatch still 0 failed |
| View c hero in the main photo slot and the thumbnails, same path-scoped cookie | Lane C | building (Sam's order) | nothing | screenshots of view c at 1440 and 390 |
| Separate access code for the demo (PARTNER_DEMO_CODE, signed gas_partner cookie, 14 days, scoped to /partner-demo and /api/partnerAnswer, 404 otherwise, rate limited) | Lane C | live (ba6560b5, Vercel Ready 23:48Z; prePush alone 0 FAIL / 6 SKIP / 37 PASS, partnerAccessCheck 30 of 30, prePush about ten minutes, no archive read over the 10-second line; live without the code: no code, wrong code, empty code all 404 on page and data endpoint, crew cookie 200 on both, headers noindex/no-referrer/no-store) | Sam proves the right code live himself in a private window (option a; nobody stores the code for a lane) | lane-notes PUSHED (Lane C, 2026-10-16T23:48Z); scripts/partnerAccessCheck.mjs; Sam's or Lane C's live confirmation |
| Window used by the 2015 Porsche 911 GT3 answer (Sam's question, report only) | Lane B | answered (year scope is the exact 2015 rung; 59 months is the sale-date window, the standard five-year read, oldest sale December 2021; twelve months alone has 6 sales, 24 months has 15; no engine change) | nothing | Lane B's answer to Sam, 22:0xZ; obdiag read with counts by window |

## 3. Buy speed

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| E1, E2, E3, E4, E6, E8 (no regeneration call, one stored-row read, enrichment beside the model round, set-aside wait bounded, one model call plus the fixed line, live read beside the tool round) | Lane E | live (12cd6a7e, 2a74a162, fddb9b6a) | nothing | scripts/buyTimes.mjs after-table in lane-notes (header and first card 2.9 to 6.7 s, median 3.6 s, against 6.9 to 8.1 s before and 18.5 to 24.4 s spikes); buySearchLineCheck 4 of 4; buyEngineMatch 14 same 0 different; "Buy six-car retime" |
| E5 (a failed spec_market_cache read is not an empty table) | Lane B | live (in e59) | nothing | e59 PUSHED line |
| E7 (00:00 UTC row reset and ENGINE_VERSION bumps put Buy cold) | Lane B | parked for launch (mitigated by the traffic-only warm, e59: 602 specs, and the demo-cars-warm-first order, not by code) | nothing | Lane B's answer to Lane F |
| Empty-result line not sent by the server over no cards (buy-speed-3) and the card 136132 naming fix | Lane E (server), Lane C (page, names) | live and rerun (buySearchLineCheck with the empty case all pass; buyEngineMatch on the Mustang: card 136132 SAME, count 4, no range both sides; "1965 Ford Mustang" 69 sales, $22,000 to $38,500) | nothing | Lane E's rerun report |
| Keyed enginecheck task overruns 300 s on e59 unless formpairs=0 and identitycounts=0 are passed (first buyEngineMatch read showed NO ENGINE READ on all four cards) | Lane E found; Lane C's script; Lane B's task | reported (Lane E sent the flags to Lane C) | whether B2's restarted runner passes the same flags | Lane E's report; B2's progress lines |
| Resolver cold start and path-on-timing (speed and correctness) | Lane B | building (in e60) | e60 | Lane B's e60 READY line |

## 4. Tasks fixes

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| Send-path read reductions (tasks-reads) | Lane D | live (8993b2fd) | nothing | lane-notes "Lane D, Oct 16 2026: Tasks send-path read reductions, DEPLOYED PROOF" (legacy 9,623 bytes to 8,098) |
| Trim guard, hunt read without description, status line (tasks-trim, three commits ending 73fe6f75) | Lane D | live (deployed proof posted: hunt 1 now matches 9001, hunts 2 and 3 unchanged; exact 997 filter 0 live with status line "Nothing black yet. 9 other cars match the rest.", 9 without colour, 16 bare) | nothing; note that Lane D's prePush ran before Lane A's card adoption landed, so its 0 FAIL does not cover the combined tree | lane-notes "Lane D, Oct 16 2026: DEPLOYED PROOF of tasks-trim"; taskFiltersCheck 79 of 79; bytesRead before and after is one SQL for Sam in that note |
| Cold-start watch event reads (13.5 MB per cold cron run; lib/live/watches.js eventsFor) | Lane C | building (Sam, 2026-10-16: Lane C's, not a launch blocker, after the tiered prePush; propose the narrowest fix and report before building) | the access code live and checked, then the tiered prePush | Lane C's proposal, then its proof |
| Numeric siblings for the four word-ified count fields (soldCountN, setAsideCountN, didNotSellCountN, period countN) | Lane B | building (in e60, approved by Sam, additions only) | nothing | Lane B's e60 READY line |
| "black series" in the curated trim vocabulary | Lane B | building (in e60, approved by Sam; two golden rows pinned: 2008 CLK63 AMG Black Series 35 sales exact 2008 $95,000 to $146,000, 2012 C63 AMG Black Series 19 sales exact 2012 $100,000 to $168,000; no-database resolver check in prePush) | the full golden set before and after, identical with the taxonomy loaded, shown before READY | Lane B's before-and-after table; the two golden rows; the prePush check |
| Other trim words that survive only through the database taxonomy (dropped on lookup timeout) | Lane B | reported (correction: Black Series is recovered by the engine's Mercedes badge fence from the raw text, not by the taxonomy; no-database resolver against production on 116 queries differs on one, the 1971 280SE 3.5 Cabriolet, an e60 item; the list is empty on the golden and sweep sets) | nothing | Lane B's 116-query comparison |
| Plain "2012 Mercedes-Benz C63 AMG" and "2008 Mercedes-Benz CLK63 AMG" answer as a refusal ("C63 models, 2010 to 2014, coupes and sedans") | Lane B | checking (Sam: two single-car reads now, not the sweep; intended body question or e58 regression; if regression, fix in e60 with a golden row) | Lane B's report | the two reads; the four screens' words if intended |
| 1971 Mercedes-Benz 280SE 3.5 Cabriolet resolves Cabriolet locally, S-Class on production | Lane B | building (stays in the e60 list, Sam's order) | e60 | golden row 46 |

## 4b. The shared card on Sell and Buy (one engine, one card)

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| Sell result screen and Buy Market Check drawer adopt sellsForCardHtml | Lane A | checking (9a75fea1 Sell and 1436f1de Buy pushed, prePush 0 FAIL / 6 SKIP / 38 PASS; live checks pending) | Vercel Ready, then Lane A's byte-identical card comparison against Market Check and 1440/390 screenshots | Lane A's live-check line in lane-notes; golden rows for Buy and Sell shared-card identity turn green |
| Basis line with no month count (Sam's rule, "Based on N sales, the latest in Month Year.") | Lane A | unknown (asked by Lane B and Lane C in lane-notes; no Lane A answer yet) | Lane A | lib/sellsForCard.js; a live card on Market Check |

## 5. Supabase speed and cost

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| project_flag backfill | Lane B | building (read-only dry run: counts by outcome, 20 flagged and 20 unflagged examples from the engine's own rule, the re-stamp scope, the rows flagged bodyshell by the pre-Oct 6 rule; queued after the e59 sweep and the window-rule table) | Sam's OK before anything touches the database; never during a warm or sweep | ~/Desktop/goasksam-proofs/db/sql-for-sam.md (one file, Lane B) |
| Count removal | Lane B | live (in e59, behind the sweep) | the e59 sweep result | e59 PUSHED line; sweep DONE |
| Real-columns migration | Lane B | building (ten added columns, an in-database batched fill, a 10,000-row and an all-rows verification, the ingest and pool-select changes, a rollback per step) | Sam runs it in the SQL editor after reading the file | ~/Desktop/goasksam-proofs/db/sql-for-sam.md |
| Window and age rule decision | Lane B measures, Sam decides | building (the table waits on the e59 sweep, which waits on B2's golden run, one load at a time) | the sweep, then Sam | Lane B's report |

## 6. SEO plan and firewall

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| SEO plan items (cookie-free caching only, never Tasks or personalised pages, the /mcp check, no live engine call on a crawl, home page block screenshots, VIN count dropped) and the revised llms.txt | Lane E | building (approved by Sam, 2026-10-16; Lane E's 00:1xZ report says the approval was not yet received, so Lane F re-sent it and asked for a receipt) | Lane E's receipt; the push prompt for laneE-notes in Lane E's window | Lane E's READY and PUSHED lines; the caching live |
| Firewall publish (the staged WAF rules) | Sam | held (stays staged and unpublished until the caching is live and e60 is live; Sam publishes it himself) | caching live, e60 live | Vercel > goasksam > Firewall |

## 7. e60 (last engine bump before launch)

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| e60 batch: year-less badge rule, resolver timing contract (a lookup timeout never changes an answer), taxonomy refresh off the request path, latestSaleDate and oldestIncludedSaleDate fields, history-page family read by the archive's columns behind a flag, body-style exports for the Buy card, the 1973 Targa label, a pure-decimal trim never pre-filtering titles (the 280SE 3.5 row), the golden loader counting words answers; warm only traffic, golden and demo cars | Lane B | building | the e59 sweep DONE (which waits on B2's golden run), then the queue | Lane B's READY, PUSH LOCK and PUSHED lines; the e60 warm DONE |

## 8. Pre-launch items

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| Rotate the Vercel bypass secret | Sam | decision | Sam, in Vercel; every lane's Keychain copy (goasksam-bypass) then goes stale | the new value working in a lane's pushCheck |
| Rotate CURTAIN_CREW_CODE | Sam | decision | Sam, in Vercel, plus a redeploy; every crew cookie ends at once, lanes need a fresh crew link | lane-notes "The crew cookie: lifetime, what ends it" |
| Tester code and tester cookie proof | Lane C (code from env with a signed cookie, d77bb921) | checking (not yet proven live: Lane A could not mint a gas_tester cookie, no CURTAIN_TESTER_CODE held) | Sam's tester code, or launch day | a live load of a gated page with the tester cookie |
| Palette choice | Sam | decision (switcher live on Market Check, Buy and Tasks via ?palette=1, crew only; A is the current look) | Sam | ~/Desktop/goasksam-proofs/palette/ |
| Sam's click-by-click steps file (Turnstile, Supabase auth settings, Resend click tracking, LAUNCH_STAGE and LAUNCH_BUSINESS, GA tag and consent; placeholders only) | Lane C | building (asked by Sam, 2026-10-16) | the access-code push | ~/Desktop/goasksam-proofs/launch/sam-steps.md |
| Turnstile | Sam | decision (proven end to end locally by Lane C, Oct 12; nothing changes until SIGNUP_TURNSTILE=1) | Sam: Cloudflare widget for goasksam.com, TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, SIGNUP_TURNSTILE=1, redeploy; the steps file | lane-notes 2026-10-12 (Lane C) TURNSTILE PROVEN |
| Supabase hook, URLs, session and SMTP | Sam, steps from Lane C | decision | the steps file | Supabase dashboard |
| Resend click tracking off | Sam | decision | Sam, in the Resend dashboard | a test email whose links are not rewritten |
| Launch stage | Sam | decision (LAUNCH_STAGE=0 today; Market Check, Buy, Tasks and Business crew only) | Sam: LAUNCH_STAGE and LAUNCH_BUSINESS in Vercel, then a redeploy | lib/_launchStage.js; a signed-out load of /market-check staying on the page |
| GA tag and consent | Sam, state written up by Lane C | decision (EEA, UK and CH visitors load nothing today; a consent banner or a consent-mode tag is an open decision) | the steps file, then Sam | lane-notes ~line 1876 |
| Company name, address and privacy email | Sam | unknown (asked) | | docs/privacy-paragraph.md; /privacy and /about live text |
| QA | every lane | building | the rows above | prePush, pushCheck, golden table, the live proofs |
| Partner data-feed message | Sam | unknown (asked) | | the sent message |
| Launch emails | Sam | unknown (asked) | | the sent emails |
| Note to Cameron | Sam | unknown (asked) | | the sent note |

## 9. Items carried from the earlier launch-day checklist (Oct 2026, still open unless struck)

- USAGE_DASHBOARD_KEY is no longer read (api/usageDashboard.js takes the probe key in the x-ops-key header only); delete it from Vercel.
- CURTAIN_TESTER_CODE and TESTER_CODE_EXPIRES: review with the tester-code row above.
- OLDCARSDATA_API_KEY, ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY: confirm current.
- Curtain removal is one commit: the curtain block, #curtain and .curtain* CSS, api/crew.js, the robots.txt Disallow (keep Allow: /privacy), and One Box's fate decided in the same commit (its gate redirects via /api/crew).
- Run docs/supabase-journeys-schema.sql once if business tracking is wanted from launch.

## Queue watch

Lane F reads docs/lane-notes.md and reports to Sam when a lane has waited more than 20 minutes on another. Current
waits are reported in the consolidated report, not here.
