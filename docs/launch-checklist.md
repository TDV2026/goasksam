# Launch checklist

Kept by Lane F (the Desk). Docs-only commits, each pushed by itself on top of origin/main. Every row carries an owner,
a state and a proof. States: building, ready, pushing, live, checking, blocked, decision (Sam's call), unknown (asked,
not yet answered). "Proof" names where the evidence sits (a lane-notes section, a script, a screenshot folder); a
row with no proof is not done whatever its state says.

Last updated: 2026-10-17T01:01Z (Lane F; AWAY MODE: Sam is away for 25 hours from 01:01Z; the rules below are in force).

## 0. Away mode (Sam away 25 hours from 2026-10-17T01:01Z)

Sam's rules, forwarded word for word to Lanes B, B2, C, D and E at 01:01Z (Lane A unreachable by the Desk; the rules are also here for it): keep working your own queue to the end, wait with long intervals; push only when every gate is green (prePush alone 0 FAIL, golden zero mismatches where it applies, live checks) and the push protocol is followed; live checks after every push, a failed live check means revert your own last push at once and stop pushing; two failed deploys in a row or an unhealthy production means every lane stops pushing and posts to Lane F; HELD FOR SAM: pushing e60, SEO edge caching (C1) going live, publishing the firewall change, any database SQL or backfill, any environment variable or secret change, launch stage settings, enabling the Supabase hook, sending anything to Cameron or any partner, changing the crew or partner codes (build to READY, then post what Sam must decide); never ask Sam in your window, post numbered questions with a recommendation to Lane F; stop when your queue is finished or you are blocked on Sam.

Lane F in away mode: no reports sent; every change, failure and blocked lane is recorded in this file as it happens (docs-only commits pushed alone); one tick six hours in writes its report into this file; the recurring 20-minute tick is cancelled. The full report goes to Sam when he returns and asks.

### Production health and stop-pushing events (newest first)
- 01:05 to 01:15Z (Lane E's prePush): Market Check fresh reads 20.5 s, 25.6 s and 30.4 s against 14, 18 and 8 s budgets, one "catching his breath" line; Lane E attributes it to the 00:00 UTC day change marking stored rows stale. No deploy failed; nothing pushed. Second lane in a row (after Lane C's four runs) whose prePush fails only on live-site speed.
- none else recorded since 01:01Z.

### Desk delivery notes
- 01:2xZ: two sends from Lane F to Lane B (the relay of Lane C's release and the watch-read proposal pointer) returned "Failed to send" while Lane B's session was busy; a third try by ref followed. Lane B's own plan does not depend on the relay: its chain waits on B2's DONE at five-minute intervals. B2 received the release relay.

### Needs Sam (ordered by what blocks the launch list)
1. Lane C item (1): the partner demo fix (54ec8f99 + a9960b18) cannot pass the full prePush while the live site's cold computes run slow; four runs each ended 1 FAIL on the live-site browser check only (fresh computes 16.7 to 24.6 s, once a 504 on /cars/porsche/911). The change touches only api/partnerAnswer.js, api/partnerDemo.js, lib/_ceilings.js and a test; offline checks green. Lane C's recommendation: a one-time exception for THIS push only, recorded in lane-notes like Lane B's e53 exception: push when every check except the browser check's Market Check and Buy timing lines passes, then run the partner-code live checks at once and revert immediately if any fails. Until Sam says so, Lane C does not push it; it retries once after Lane B's sweep DONE in a quiet window. Meanwhile a partner-code session still sees no sales on the demo.
2. Window and age rule decision (blocks e60 push, which blocks row 46 of the golden table and "every car returns a range"); Lane B's table follows the e59 sweep.
3. Lane B's suggestion for tonight's prePush: page loads one at a time, warm prePush's perf cars with a crew read each first, add them to the e60 warm list.
4. GA tag and consent: keep or change (state proven, consent mode plus banner for EEA, UK, CH).
5. Golden truth in the fast prePush tier (Lane C left it out; it reads the archive).
6. Post-midnight warm scope (Lane B recommends demo cars and golden rows at 00:05 UTC).
7. Sam's own checks when back: prove the partner code live in a private window; read ~/Desktop/goasksam-proofs/launch/sam-steps.md and ~/Desktop/goasksam-proofs/db/sql-for-sam.md; look at ~/Desktop/goasksam-proofs/seo/llms.txt.

### Lane questions posted to Lane F while Sam is away (numbered, with the lane's recommendation)
- Lane C (1), 01:1xZ: the demo-fix prePush exception, see Needs Sam item 1.

### Lane words received while Sam is away (verbatim, newest first)
- Lane C, 01:2xZ: "1. PUSHED 878d3ef8 at 01:07Z, Vercel Ready, scripts only: the tiered prePush (now live in prePush for every lane: --tier full|fast, --tier-only; the engine-and-data list is scripts/engineDataFiles.mjs), the GA consent test (21 of 21, in prePush), buyEngineMatch's formpairs=0&identitycounts=0. Gate: prePush alone, its own fast tier, 0 FAIL, 8 SKIP, 33 PASS in 101 s. Live after: browser search check 5 pages PASS on production. Order note: pushed ahead of the blocked demo fix because it changes nothing the site serves. 2. READY, partner-fix (demo fix): blocked by the live site's speed (four full-tier runs failed on cold computes); retry once after Lane B's sweep DONE, or Sam's one-time exception (item 1 sent earlier). 3. READY, lanec-seo: SEO C3 og tags, C2 hub lead and meta '{n} recorded sales, as of {date}.' (no VIN count), C4 sitemap lastmod, C5 hub to /cars/porsche/911 link. Full tier (api/history.js), pushes in a quiet window. 4. HELD FOR SAM, lanec-seo-c1: C1 cookie-free edge cache for /history and /vin (built, not pushed). Sam decides when it goes live; the firewall bypass follows it. 5. WAITING: the watch-read fix (needs Lane B's two answers), card body names (e60 export), Buy palette tokens (after Sam picks the palette). Lane C is now blocked on the quiet window and on Sam; stopping until Lane B's sweep DONE."
- Lane E, 01:1xZ: "Built to READY: buy-speed-4 = E9, one resolve of the typed sentence per Buy turn (55bb8efc; chatCore namesCar hook, samChat resolveOnce; nine stubbed scenarios and the deadline test pass). Push attempt under the protocol: lock taken 01:04Z, prePush alone: 0 code failures, 1 browser-check FAIL that is production's own state on today's main (E9 not deployed): Market Check perf 20.5 s, 25.6 s and 30.4 s against 14 s, 18 s and 8 s budgets plus one 'catching his breath' line, after the 00:00 UTC day change marked the stored rows stale; 6 SKIPs are the archive checks (no keys here) and the partner endpoint (no crew cookie). Nothing pushed, lock released 01:15Z, no revert needed. Production latency item for the checklist: Market Check reads 20 to 30 s at 01:05 to 01:15Z. Plan: one more prePush alone later when a single light Market Check read is under 10 s, no loop; if that fails, E9 waits for Sam. Everything else of mine is READY or waiting on other lanes (Lane A/C caching, Lane B e60, the firewall publish and llms.txt going live are HELD FOR SAM). Stopping now per the relay."
- Lane C, 01:1xZ: "STATE: the partner demo fix (54ec8f99 + a9960b18: the internal read past Market Check's seal, the last good answer, no false no-sales text, the hero on view c, the demo's own daily car limit) is built and offline-green (partnerEngineMatch 40/40, partnerAccessCheck 30/30) but NOT pushed: four prePush runs alone (17:11, 17:33, 17:46, 17:53 PDT) each ended 1 FAIL, always the browser check of the LIVE site: fresh Market Check computes 16.7 to 24.6 s against budgets of 8 to 18 s, the 'catching his breath' health line, Buy's header slow or absent, once a 504 on the public /cars/porsche/911 hub page. Lane B measured the database itself slow (a trivial read 21 s at 00:45Z, 1.2 s at 00:52Z). The live demo therefore still shows no sales to a partner-code session, and view d still says 'No recorded sales of cars like this yet.' on a failed read. B2 and Lane B are released (I won't hold the archive); I retry the demo fix once after Lane B's sweep DONE, in a quiet window. ... Rest of my queue: the tiered prePush and the GA consent test are built (scripts only); the watch-read proposal is posted (390fcb8c) and waits on two answers from Lane B; Lane E's SEO C1 to C5 are next to build up to READY (C1 going live is held for Sam)."
- Lane B, 01:0xZ: "Lane B to Lane F: acknowledged, all six points. My queue while Sam is away, in order, one load at a time: (1) the e59 sweep after B2's DONE (my chain waits on it at five-minute intervals, up to 14 hours), (2) the window-and-age table, (3) the sampled project-flag dry run (read-only, the existing projscan task over 5,000 rows), (4) the SQL file for Sam at ~/Desktop/goasksam-proofs/db/sql-for-sam.md (dry-run counts and examples, the re-stamp scope, the real-columns steps with rollbacks), (5) e60 built to READY on its own branch with local checks green and the before/after on the golden set, NOT pushed. Nothing touches the database, no environment or secret changes, no e60 push. HELD FOR SAM, with my recommendation each: (a) the window and age rule, decide after the table; (b) the real-columns fill and the project-flag re-stamp, run only after his OK, never during a warm or sweep; (c) e60's push. Reports to you at each DONE; then I stop."
- Lane D, 01:0xZ: "LANE D state: queue finished, stopping per item 6. Nothing unpushed, nothing held for Sam, no open questions. Live on main and accepted: Tasks palette (4c00b688), Sell sales count (5a7a90e9), Tasks send-path reads (8993b2fd), tasks-trim with the hunt status line (73fe6f75). Worktree goasksam-laneD: branch tasks-trim equals its pushed state; origin/main..HEAD is empty; only untracked proofs/ remains. Open notes for others, already in docs/lane-notes.md: FOR LANE B (word-ified count fields; cold-instance watch eventsFor read on the first Tasks run), the bytesRead SQL for Sam. I will not push, run heavy jobs or check in further unless new work is assigned. Search check: no public page touched."

## 1. The four launch items

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| Market Check matches the mockup | Lane A | checking (zero gaps on the four named cars, Oct 16) | Sam's sign-off on the cited approved differences | lane-notes "Job 1 (Lane A, Sam's four-car mockup check, 2026-10-16)"; ~/Desktop/goasksam-proofs/card/audit-{911,mustang,speedster,275gtb}-{1440,390}.png |
| Every car returns a range | Lane B | building (e59 live; e60 is the last engine bump before launch; 1971 Mercedes-Benz 280SE 3.5 Cabriolet still hits the 20-second deadline card, an e60 item) | e60 push; the e59 four-lane sweep (parked until B2's golden run is DONE) | lane-notes Lane B RUNNING/DONE lines; e59 sweep DONE line when posted |
| Golden table zero mismatches across Market Check, Buy, Sell and Tasks | Lane B2 | PAUSED at 00:33Z (Sam's option 1; rows done 20 of 46, process frozen with SIGSTOP so finished reads stay in memory, the in-flight chunk 19 to 21 finishes on the server; resume is kill -CONT on PID 91225 after Lane C's PUSHED, fallback --ids command in B2's line; no archive reads until then; rows 1 to 45 pinned, row 46 waits on e60; expected red until others act: rows 32, 37, 38 states-a-body lines and the Buy and Sell shared-card identity, Sell count rows 8, 10, 14, 22, 23, 39 to 41) | released by Lane C at 01:1xZ to resume now; e60 for row 46 | B2's pause line with the resume command; progress lines; DONE with per-product counts; the final launch run renders all 46 pages |
| Sam's own review | Sam | decision | the three rows above | Sam's note in lane-notes |

## 2. Partner demo

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| eBay partner demo (/partner-demo, four views, shared card) | Lane C | INCIDENT, fix READY (branch partner-fix, 54ec8f99 + a9960b18, not pushed), four prePush runs each 1 FAIL on the LIVE site's speed only (Market Check perf reads 17.5 to 24.6 s, a catching-his-breath line, Buy header not drawn by 20 s), push held; the fix: internal call with the credential from the environment only, last good answer per demo car under a day old, one retry then could-not-read, view c hero, partner_cars limit 30 a day per device and 60 per address with the demo's six never counting, a stale answer renders as the engine's answer; offline partnerEngineMatch 40 of 40, partnerAccessCheck 30 of 30. Cause (b): the data endpoint calls Market Check's handler in-process with the visitor's headers; Market Check is sealed before launch (CURTAIN_SEALED, isReleased) and refused a gas_partner session with no crew cookie, so the page drew could-not-read and view d fell to the false no-sales text. Not a cold read (all six demo cars 200 in 0.9 to 4.0 s with the crew cookie at 00:05Z; Lane B: all seven stored rows present before the warm, the 00:00 UTC gate only marked them stale, all seven fresh by 00:06Z, 2015 GT3 readAt 00:04:48 with 43 sales $120,000 to $143,000). Lane C's crew-cookie live checks missed it. | prePush FAILED a second time with B2 paused (00:33 to 00:44Z: Market Check perf reads 18.4 to 23.6 s, public /cars/porsche/911 returned HTTP 504 within 60 s; stored-row reads 1.7 to 2.8 s, so the slow part is fresh computes); database back under the line at 00:52Z per Lane B; Lane C's third prePush can run; order of loads tonight one at a time: Lane C's push, B2's table, Lane B's sweep, the window table (Sam approved: the in-process read carries the server's internal credential, no engine change; the credential must never reach a body, header, log, error, test output or note; the partner endpoint gets its own daily car limit per address and device, demo cars within it; a stale row renders as an engine answer, never an error) | live checks on all four views at 1440 and 390 first from a partner-code session (Keychain goasksam-partner-code, private browser, no crew cookie; /market-check still goes to /sell) then from the crew cookie; wrong code still 404; PUSHED only when the partner-code session shows data on all four views; Desktop/goasksam-proofs/partner/live/ |
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
| E9, one resolve of the typed sentence per Buy turn (buy-speed-4, 55bb8efc) | Lane E | READY, not pushed (prePush alone 0 code failures, 1 live-site browser-check FAIL on Market Check speed) | a quiet window with a light Market Check read under 10 s for one more prePush; else waits for Sam | nine stubbed scenarios and the deadline test pass; the PUSHED line |
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
| SEO plan items (cookie-free caching only, never Tasks or personalised pages, the /mcp check, no live engine call on a crawl, home page block screenshots, VIN count dropped) and llms.txt | Lane E (llms.txt placed by Lane A at public/llms.txt) | ready for Lane A (llms.txt approved by Sam in Lane E's window; the text is on main word for word as a FOR LANE A line, 439c066d; challenged at the edge until Sam publishes the firewall draft, so it can ship now and becomes readable then) | Lane A's next push (no Lane A session running, lane-notes is the channel); the caching items for Lanes A, C and B's e60; then Lane E's live proofs | /llms.txt answers 200 text/plain as Googlebot with exactly those bytes |
| SEO C2 to C5 (C2 hub lead and meta "{n} recorded sales, as of {date}." with no VIN count, C3 og tags on VIN and hub pages, C4 sitemap lastmod, C5 hub link to /cars/porsche/911; api/history.js) | Lane C builds, Lane E proves | READY (branch lanec-seo, full tier) | a quiet window for the full-tier prePush | Lane E's seoAudit proofs after the push |
| SEO C1 cookie-free edge cache for /history and /vin | Lane C | READY, HELD FOR SAM (branch lanec-seo-c1, built, not pushed) | Sam decides when it goes live; the firewall bypass follows it | Lane E's seoAudit cache HIT proof after it ships |
| SEO A1 to A4 and the Lane B items (lane-notes FOR LANE A and FOR LANE B under the SEO plan) | Lane A, Lane B | not started (Lane A unreachable by the Desk) | Lane A's and Lane B's pushes | Lane E's seoAudit proofs |
| Firewall publish (the staged WAF rules) | Sam | held (stays staged and unpublished until the caching is live and e60 is live; Sam publishes it himself) | caching live, e60 live | Vercel > goasksam > Firewall |

## 7. e60 (last engine bump before launch)

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| e60 batch: year-less badge rule, resolver timing contract (a lookup timeout never changes an answer), taxonomy refresh off the request path, latestSaleDate and oldestIncludedSaleDate fields, history-page family read by the archive's columns behind a flag, body-style exports for the Buy card, the 1973 Targa label, a pure-decimal trim never pre-filtering titles (the 280SE 3.5 row), the golden loader counting words answers, readAt on every tier (a thin answer carries none today, the 275 GTB row); warm only traffic, golden and demo cars | Lane B | building | the e59 sweep DONE (which waits on B2's golden run), then the queue | Lane B's READY, PUSH LOCK and PUSHED lines; the e60 warm DONE |

## 7a. Lane C queue after the demo fix (Sam's order)

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| Tiered prePush (FULL for engine-and-data files per scripts/engineDataFiles.mjs, FAST for every other push; --tier full, --tier fast, --tier-only) | Lane C | live (878d3ef8, 01:07Z, Vercel Ready; its own fast tier 0 FAIL / 8 SKIP / 33 PASS in 101 s; browser search check 5 pages PASS live) | Sam's word on golden report-only in the fast tier (left out) | lane-notes THE TIERED PREPUSH RULE; the PUSHED line |
| Watch-read proposal (13.5 MB eventsFor on a cold cron instance) | Lane C | proposal posted (390fcb8c) | two answers from Lane B | Lane C's proposal in lane-notes |
| scripts/buyEngineMatch.mjs passes formpairs=0 and identitycounts=0 | Lane C (Lane E's find) | live (878d3ef8) | nothing | the script's run |
| Buy card names from lib/vehicle.js's body list | Lane C | waits on Lane B's e60 body-style exports | e60 | buyNameBodyCheck |
| Lane A's card options for the demo's basis line and static How Sam decides | Lane A | asked, not landed | Lane A | the demo dropping its own edit |
| Buy palette: Buy's own hard-coded colours onto palette tokens | Lane C | decided (Sam: yes, after Sam picks the palette; not before the demo fix or e60) | Sam's palette pick | a palette B to H render on Buy |

## 7b. After launch (notes, not built)

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| Internal-caller flag in sellerDecision.js for in-process reads | Lane B | note for after launch (Sam's decision) | launch | |
| Warm just after 00:00 UTC each day (the day change marks every stored row stale; a stale row is served at once with the dated line and recomputes on first visit) | Lane B | reported (recommendation: yes, small and targeted, the seven demo cars and the 38 golden rows at 00:05 UTC, about 45 page reads and 150 MB, a crew-cookie read loop from the nightly jobs' place; not the 602-spec traffic warm, 2 to 4 GB a day for a line that disappears on the second visit) | Sam's decision | Lane B's report to Lane F |

## 8. Pre-launch items

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| Rotate the Vercel bypass secret | Sam | decision | Sam, in Vercel; every lane's Keychain copy (goasksam-bypass) then goes stale | the new value working in a lane's pushCheck |
| Rotate CURTAIN_CREW_CODE | Sam | decision | Sam, in Vercel, plus a redeploy; every crew cookie ends at once, lanes need a fresh crew link | lane-notes "The crew cookie: lifetime, what ends it" |
| Tester code and tester cookie proof | Lane C | checking (signed tester cookie checked offline in every prePush, scripts/testerCheck.mjs PASS; NO live tester proof this session) | Sam's tester code, or launch day | a live load of a gated page with the tester cookie |
| Palette choice | Sam | decision (switcher live on Market Check, Buy and Tasks via ?palette=1, crew only; A is the current look) | Sam | ~/Desktop/goasksam-proofs/palette/ |
| Sam's click-by-click steps file (Turnstile, Supabase hook, URLs, sessions, SMTP, Resend click tracking, LAUNCH_STAGE and LAUNCH_BUSINESS, GA and consent; placeholders only; each with what Sam sees when it worked and how to undo) | Lane C | done (now also records the session default, the sender hello@goasksam.com with noreply@ as fallback, and Buy colours onto palette tokens after Sam picks the palette) | Sam reads it | ~/Desktop/goasksam-proofs/launch/sam-steps.md |
| Turnstile | Sam | decision (proven end to end locally by Lane C, Oct 12; nothing changes until SIGNUP_TURNSTILE=1) | Sam: Cloudflare widget for goasksam.com, TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, SIGNUP_TURNSTILE=1, redeploy; the steps file | lane-notes 2026-10-12 (Lane C) TURNSTILE PROVEN |
| Supabase hook, URLs, sessions and SMTP | Sam, steps from Lane C | decision made on the open parts (session length: the default, no time limit and no inactivity timeout; sender hello@goasksam.com, noreply@goasksam.com if Sam cannot receive at hello); still to do by Sam: set SUPABASE_AUTH_HOOK_SECRET and redeploy BEFORE enabling the hook, Site URL https://goasksam.com, Redirect URLs https://goasksam.com/** and https://www.goasksam.com/**, SMTP smtp.resend.com 465 user resend with a dedicated key | Sam, following sam-steps.md | a test sign-up and a test email |
| Resend click tracking off | Sam | decision (off in the Resend domain settings) | Sam | a test email whose links start https://goasksam.com/ |
| Launch stage | Sam | decision (LAUNCH_STAGE 1 opens Market Check and Tasks, 2 adds Buy; LAUNCH_BUSINESS=1 opens /business; CURTAIN_SEALED must be 0 for public Market Check, its API seal refuses non-crew whatever the stage; each needs a redeploy) | Sam, in Vercel, then a redeploy | a signed-out load of /market-check staying on the page |
| GA tag and consent | Sam | decision (keep or change). Today, proven by test: one GA4 tag on every public page (GA_MEASUREMENT_ID in Vercel, else the code's default). Visitors in the 32 EEA, UK and Swiss countries LOAD the tag in consent mode with analytics storage denied, and a small Allow / No thanks banner decides (remembered); every other country loads it with no banner; crew browsers and any host other than goasksam.com load nothing. No VIN, search words, email or code is ever sent. | Sam's own EEA VPN load at launch QA | scripts/gaConsentCheck.mjs (Lane C, the real api/gaConsent.js with Vercel's x-vercel-ip-country header: DE, FR, IE, NL, PL, SE, IS, LI, NO, GB, CH load with consent required; US, CA, AU, JP, MX and no country load with no banner; crew and another host load nothing; 21 of 21; in prePush since 878d3ef8) |
| Company name, address and privacy email | Sam | unknown (asked) | | docs/privacy-paragraph.md; /privacy and /about live text |
| QA | every lane | building | the rows above | prePush, pushCheck, golden table, the live proofs |
| Partner data-feed message | Sam | unknown (asked) | | the sent message |
| Launch emails | Sam | unknown (asked) | | the sent emails |
| Note to Cameron | Sam | unknown (asked) | | the sent note |

## 8b. Live-site health, open

| Item | Owner | State | Blocked on | Proof |
|---|---|---|---|---|
| Database slow with every lane load paused (readings 42 s 23:46Z, 23 s 00:01Z, 48 s 00:17Z, 9 s 00:32Z, a one-row ops read 21 s at 00:45Z; Market Check fresh computes 18 to 24 s; /cars/porsche/911 HTTP 504 ~00:40Z) | Lane B read it | recovered at 00:52Z (ops read 1.2 s, a cold Market Check compute 8.0 s; Lane B: nothing of Lane B's running; cold buffer cache after the evening's full-table scans on Small compute, so every fresh compute pays disk reads; Lane C's prePush loads several pages in parallel and its perf cars without a stored row are fresh computes, four or more cold computes at once; the after-midnight recompute adds one per stored row visited) | Sam's decision on Lane B's suggestion: prePush page loads one at a time tonight, warm prePush's perf cars with a crew read each before the run, add them to the e60 warm list | a fresh compute under 10 s; /cars/porsche/911 200 |

## 9. Items carried from the earlier launch-day checklist (Oct 2026, still open unless struck)

- USAGE_DASHBOARD_KEY is no longer read (api/usageDashboard.js takes the probe key in the x-ops-key header only); delete it from Vercel.
- CURTAIN_TESTER_CODE and TESTER_CODE_EXPIRES: review with the tester-code row above.
- OLDCARSDATA_API_KEY, ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY: confirm current.
- Curtain removal is one commit: the curtain block, #curtain and .curtain* CSS, api/crew.js, the robots.txt Disallow (keep Allow: /privacy), and One Box's fate decided in the same commit (its gate redirects via /api/crew).
- Run docs/supabase-journeys-schema.sql once if business tracking is wanted from launch.

## Queue watch

Lane F reads docs/lane-notes.md and reports to Sam when a lane has waited more than 20 minutes on another. Current
waits are reported in the consolidated report, not here.
