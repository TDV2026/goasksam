# Launch checklist

Kept by Lane F (the Desk). Docs-only commits, each pushed by itself on top of origin/main. Every row carries an owner,
a state and a proof. States: building, ready, pushing, live, checking, blocked, decision (Sam's call), unknown (asked,
not yet answered). "Proof" names where the evidence sits (a lane-notes section, a script, a screenshot folder); a
row with no proof is not done whatever its state says.

Last updated: 2026-10-16 (Lane F, first cut, built from docs/lane-notes.md and the lanes' first reports).

## 1. The four launch items

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| Market Check matches the mockup | Lane A | checking (zero gaps on the four named cars, Oct 16) | Sam's sign-off on the cited approved differences | lane-notes "Job 1 (Lane A, Sam's four-car mockup check, 2026-10-16)"; ~/Desktop/goasksam-proofs/card/audit-{911,mustang,speedster,275gtb}-{1440,390}.png |
| Every car returns a range | Lane B | building (e59 live; e60 is the last engine bump before launch; 1971 Mercedes-Benz 280SE 3.5 Cabriolet still hits the 20-second deadline card, an e60 item) | e60 push; the e59 four-lane sweep (parked until B2's golden run is DONE) | lane-notes Lane B RUNNING/DONE lines; e59 sweep DONE line when posted |
| Golden table zero mismatches across Market Check, Buy, Sell and Tasks | Lane B2 | checking (full table rows 1 to 46 RUNNING on e59 since 22:48Z) | the run finishing; rows pending e60 (280SE 3.5 Cabriolet) | docs/golden-rules.md; scripts/goldenTruth.mjs; B2's DONE line |
| Sam's own review | Sam | decision | the three rows above | Sam's note in lane-notes |

## 2. Partner demo

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| eBay partner demo (/partner-demo, four views, shared card) | Lane C | live (deploy 51da5743; partnerEngineMatch live half 62 passed, 0 failed) | nothing | lane-notes "Partner demo live on Sam's Oct 16 changes"; ~/Desktop/goasksam-proofs/partner/live/ |
| Separate access code for the demo | Lane C | decision (today crew cookie only; PARTNER_KEY unset) | Sam: whether the partner gets its own code (PARTNER_KEY) and its value | api/partnerAnswer.js, api/partnerDemo.js; the env listing once set |
| Window used by the 2015 Porsche 911 GT3 answer (Sam's question, report only) | Lane B | unknown (asked) | Lane B's answer | lane-notes "FOR LANE B: which window did the 2015 Porsche 911 GT3 answer use?" |

## 3. Buy speed

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| E1 to E4 (no regeneration call, prepared enrichment, set-aside label cap, fixed line) | Lane E | live (buy-speed, buy-speed-2, buy-speed-3 pushed by Lane C) | nothing | lane-notes "Lane E, Buy speed: MEASURED"; "Buy six-car retime" (first card 3.2 to 5.4 s fresh, 1.2 to 4.5 s reload); buySearchLineCheck 4 of 4 |
| E5 (a failed spec_market_cache read is not an empty table) | Lane B | live (in e59) | nothing | e59 PUSHED line |
| E7 (00:00 UTC row reset and ENGINE_VERSION bumps put Buy cold) | Lane B | unknown (asked) | Lane B to say whether it is in e60 | lane-notes Lane E proposal, E7 |
| Empty-result line not sent by the server over no cards | Lane E | live (buy-speed-3) | nothing | Lane C's 23:10Z PUSHED line |

## 4. Tasks fixes

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| Send-path read reductions (tasks-reads) | Lane D | live (8993b2fd) | nothing | lane-notes "Lane D, Oct 16 2026: Tasks send-path read reductions, DEPLOYED PROOF" (legacy 9,623 bytes to 8,098) |
| Trim guard, hunt read without description, status line (tasks-trim, three commits) | Lane D | pushing (PUSH LOCK 23:22Z, prePush running alone) | prePush 0 FAIL | Lane D's PUSHED line; scripts/taskFiltersCheck.mjs (79 of 79); the three hunts rerun after deploy (hunt 1 expected to match 9001) |
| Cold-start watch event reads (13.5 MB per cold cron run) | Lane B | unknown (observation by Lane D, not assigned) | Sam: whether it is launch scope | lane-notes "FOR LANE B (observation, not mine to fix)" |

## 5. Supabase speed and cost

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| project_flag backfill | Lane B | building (dry run queued after the e59 sweep and the window-rule measurement) | Sam's OK before anything touches the database | ~/Desktop/goasksam-proofs/db/sql-for-sam.md (one file, Lane B) |
| Count removal | unknown (asked) | unknown | | |
| Real-columns migration | Lane B | building (SQL for Sam, same file) | Sam runs it in the SQL editor | ~/Desktop/goasksam-proofs/db/sql-for-sam.md |
| Window and age rule decision | Lane B measures, Sam decides | building (measurement queued after the e59 sweep) | the measurement, then Sam | Lane B's report |

## 6. SEO plan and firewall

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| SEO plan items | unknown (asked) | unknown | | docs/search-rules.md is the rule set; the plan's open items are not in lane-notes under that name |
| Firewall publish (the staged WAF rules) | unknown (asked; Sam edits the firewall by hand) | unknown | | Vercel > goasksam > Firewall |

## 7. e60 (last engine bump before launch)

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| e60 batch: year-less badge rule, resolver timing contract, taxonomy refresh, latest-sale and oldest-included-sale fields, history-page family read, body-style exports (Lane C's ask), the 1973 Targa label; warm only traffic, golden and demo cars | Lane B | building | the e59 sweep DONE, then the queue | Lane B's READY, PUSH LOCK and PUSHED lines; the e60 warm DONE |

## 8. Pre-launch items

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| Rotate the Vercel bypass secret | Sam | decision | Sam, in Vercel; every lane's Keychain copy (goasksam-bypass) then goes stale | the new value working in a lane's pushCheck |
| Rotate CURTAIN_CREW_CODE | Sam | decision | Sam, in Vercel, plus a redeploy; every crew cookie ends at once, lanes need a fresh crew link | lane-notes "The crew cookie: lifetime, what ends it" |
| Tester code and tester cookie proof | Lane C (code from env with a signed cookie, d77bb921) | checking (not yet proven live: Lane A could not mint a gas_tester cookie, no CURTAIN_TESTER_CODE held) | Sam's tester code, or launch day | a live load of a gated page with the tester cookie |
| Palette choice | Sam | decision (switcher live on Market Check, Buy and Tasks via ?palette=1, crew only; A is the current look) | Sam | ~/Desktop/goasksam-proofs/palette/ |
| Turnstile | Sam | decision (proven end to end locally by Lane C, Oct 12; nothing changes until SIGNUP_TURNSTILE=1) | Sam: Cloudflare widget for goasksam.com, TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, SIGNUP_TURNSTILE=1, redeploy | lane-notes 2026-10-12 (Lane C) TURNSTILE PROVEN |
| Supabase hook, URLs, session and SMTP | unknown (asked) | unknown | | Supabase dashboard |
| Resend click tracking off | Sam | decision | Sam, in the Resend dashboard | a test email whose links are not rewritten |
| Launch stage | Sam | decision (LAUNCH_STAGE=0 today; Market Check, Buy, Tasks and Business crew only) | Sam: LAUNCH_STAGE and LAUNCH_BUSINESS in Vercel, then a redeploy | lib/_launchStage.js; a signed-out load of /market-check staying on the page |
| GA tag and consent | unknown (asked) | decision (EEA, UK and CH visitors load nothing today; a consent banner or a consent-mode tag is an open decision) | Sam | lane-notes ~line 1876 |
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
