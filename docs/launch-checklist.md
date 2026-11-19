# Launch checklist

Kept by Lane F (the Desk). Docs-only commits. States: done, in progress, not started, waiting on Sam, held, decision. A row with no proof is not done whatever its state says. Where the docs do not show a state, the row says "not in the docs".

Last updated: 2026-10-24, from origin/main 2944b2d4 (ENGINE e82-20261023-ladderwindow live). Staged send, rollback and freeze rules: docs/launch-runbook.md. Older detail: docs/archive/launch-checklist-through-oct-23.md (its tables date from Oct 16 to 18) and docs/archive/lane-notes-through-oct-21.md.

Beta launch to the newsletter audience. Verdict today: NO-GO. Rows marked YES in the last column of table A must be done before the first send.

## Rulings closed by Sam (do not reopen)

| Ruling | Decision | Effect |
|---|---|---|
| The 1981 Porsche 911 SC cabriolet card reads "set aside for having no photo" | Keep as built | Closed. lib/onebox.js whyAside stays. |
| Task email subjects "Sam found a ..." | Third person is fine | Closed. No change. |
| VIN rollout cache rebuild ("Rebuild VIN rollout cache", then Lane E reads sitemap-vins.xml for 301s) | Needed only after Lane B's VIN and naming work lands | NOT needed for e81 or e82. Re-open the row when that work is pushed. |

## A. Launch gates

| Gate | State | Owner | Proof | Before first send |
|---|---|---|---|---|
| No-refusal sweep | In progress. e82 live; Lane C's look at 00:29Z Oct 24: no refusal on ten cars (Camaro, 1965 and 1966 Mustang, 1972 and 1967 Corvette, 1987 911, Land Cruiser, M3, Charger, 1957 Bel Air). Lane B's Stage 1b (failed chip checks fall back, the range stays), Stage 3 (VIN and chassis) and the 30-car refusalCheck plus the 177-car --sweep are on Lane B's local branch, not on main. No full sweep DONE line posted. | Lane B (checks), Lane C (push) | lane-notes LOOK DONE (Lane C, 00:29Z); commits b099cab5, 763f825f, 16c2c6ef, e3de16ef | YES |
| Golden table, zero mismatches across Market Check, Buy, Sell, Tasks | In progress. Last full state in the docs is B2's Oct 18 read (72 PASS, 6 FAIL, 2 render drift, 3 pending, 4 re-read). Engine has moved e60 to e82 since. Lane B asked to run it after e81 and re-probe after e82; no result posted. | Lane B, Lane B2 | none on the current engine | YES |
| Chip counts vs header count on body pages (1972 Corvette 24 vs 18; 1957 Bel Air 51 vs 24; 1969 Camaro 8 + 9 vs eight) | Open question. Chips read longer windows and each carries a note, but the sums differ. | Lane B reports; Sam rules | lane-notes LOOK DONE 00:04Z and 00:29Z | YES |
| Sign-in checks | Waiting on Sam. No lane holds a signed-in credential. His checks: the signed-in Tasks question bar; the real sign-in flow from Stage 3 (query and action kept across sign-in). No report either was done. | Sam | lane-notes LOOK DONE 14:23Z Oct 23 | YES |
| Emails and DNS | Waiting on Sam, parked by Sam as the last item (Oct 21). Open: duplicate SPF on send.mail, Resend verified only for mail.goasksam.com, apex SPF lacks Microsoft 365, DMARC, a sign-in code that reached Hotmail spam, Resend click tracking off, the Supabase hook, URLs and SMTP, Turnstile (SIGNUP_TURNSTILE). Templates: List-Unsubscribe on every car email; the test set went to feedback@ only. | Sam; Lane C (templates) | docs/lane-security.md email deliverability; steps in ~/Desktop/goasksam-proofs/launch/sam-steps.md | YES (Lane F's call; Sam parked it) |
| Key rotations | Waiting on Sam. Vercel bypass secret and CURTAIN_CREW_CODE: decision. Rotation step 1 (CURTAIN_TESTER_CODE, DAYPASS_CODE, ONCE_SECRET) delivered Oct 21, no done line, steps 2 and 3 wait on it. Also: delete USAGE_DASHBOARD_KEY; confirm the OldCarsData, Anthropic and Supabase service keys are current. Full-history scans found no live key. Rotating the crew code ends every lane's cookie; the bypass rotation stales every lane's Keychain copy. | Sam | docs/lane-security.md | YES (Lane F's call), done when no push lock is open |
| Terms page | Not started. The Terms link stays out until the page exists; Sam supplies the text. | Sam (text), Lane C (page) | lane-notes FROM SAM 13:48Z Oct 23, item 5 | Not decided |
| Sell switch (SELL_NEXT_ON) | Waiting on Sam. New Sell is off until Sam's review. Public `/` redirects to `/sell` until Find is released. The old Sell is the public Sell. | Sam, Lane C | lane-notes FROM SAM 13:48Z Oct 23 | YES |
| Launch stage (LAUNCH_STAGE, CURTAIN_SEALED, LAUNCH_BUSINESS) | Waiting on Sam. Production values not in the docs. Code: stage 0 Sell only, 1 adds Market Check and Tasks, 2 adds Buy; CURTAIN_SEALED=1 refuses non-crew calls to the engine endpoints whatever the stage. Launch order from Sam: Market Check and Tasks first, Buy at stage 2. | Sam | lib/_launchStage.js | YES |
| Spend cap and budget alert | Waiting on Sam. Supabase spend cap is off (Lane S brief, Oct 21); compute is Large since Oct 18. A budget alert on Vercel, Supabase or Anthropic: not in the docs. Rate limits on every public route: Lane S's review item, answer in docs/lane-security.md. | Sam | lane-notes line "Abuse and cost" (archive) | YES |
| Anthropic credit and auto-reload | Not in the docs. | Sam | none | YES |
| Rollback switches | Written in docs/launch-runbook.md. Not yet confirmed by Sam. The Vercel "promote previous deployment" step has not been rehearsed. | Sam, Lane C | docs/launch-runbook.md | YES |
| Staged-send plan | Drafted in docs/launch-runbook.md. Segment, sizes and watch period are "not decided". | Sam | docs/launch-runbook.md | YES |
| Sam's own review of the three launch items | Waiting on Sam. | Sam | none | YES |
| Palette choice and picker removal | Waiting on Sam. The bar is crew only, behind PALETTE_BAR_ON (true) in lib/appShell.js; removal needs a push. | Sam, Lane C | lane-notes PUSHED 14:20Z Oct 23 | YES |
| Firewall publish | Held. Staged WAF rules stay unpublished until caching is live; e60 is live. Caching state not in the docs. | Sam | Vercel, goasksam, Firewall | Not decided |
| Launch emails, note to Cameron, partner data-feed message | Unknown (asked). | Sam | none | YES (launch emails) |
| Company name, address, privacy email | Deferred by Sam (Oct 19). | Sam | docs/privacy-paragraph.md | Not decided |
| GA tag and consent | Decided; proven by test (gaConsentCheck, 21 of 21). Sam's own EEA VPN load still to do. | Sam | scripts/gaConsentCheck.mjs | Not decided |
| Tester code live proof | Not done. Checked offline in every prePush only. | Lane C, Sam | scripts/testerCheck.mjs | Not decided |
| Calculator (Daily Vroom) F-31 | Open. SQL Step 0 and Step 1 sent to Sam, no run shown. Private-repo and rates.json parked by Sam (Oct 21). | Sam, Lane D | lane-notes FROM SAM 16:43Z Oct 21 (archive) | Not decided |
| Buy speed after e76 | Not shown closed. First cards 24 to 38 s on Oct 21. | Lane B | lane-notes event 18:06Z Oct 21 (archive) | YES |

## B. Workstreams (current state)

| Workstream | State | Owner | Proof |
|---|---|---|---|
| Market Check matches the mockup | Four-car check: zero gaps on Oct 16. Re-check after the 2.0 and candle changes: not in the docs. | Lane C (Lane A closed) | archive, section 1 |
| Every car returns a range | In progress, see A. | Lane B | A |
| Shared card on Sell, Buy, Tasks, emails | Done. One card, Find's own component on Tasks and in emails (737942ab, 561633e0). | Lane C | lane-notes PUSHED 18:01Z and 21:45Z Oct 23 |
| Partner demo (/partner-demo) | Held by Sam. Amazon rounds ran through revision 4 (Oct 20 and 21). Current state of the eBay stages 1 to 5 not in the docs. | Lane C, Lane G (closed) | archive |
| Buy redesign, Stages 1 to 4 | `/buy` answers 301 to `/find`. Find, Market Check, Sell and Home start pages live with Stage 4 (server-rendered, own titles, structured data). | Lane C | lane-notes PUSHED bd1eba0b |
| Buy speed items E1 to E8 | Done and live. E9 (one resolve per Buy turn): state not in the docs. | Lane E | archive, section 3 |
| Tasks fixes (send-path reads, trim guard, signed-in link, leftover words) | Done and live; the Tasks signed-in bug fixed (93f6ba2b) and looked at. | Lane D, Lane C | lane-notes LOOK DONE 14:23Z Oct 23 |
| Supabase speed and cost | Compute Large (Oct 18). Real-columns migration: held by Sam (new window later, not a launch blocker). Project-flag re-stamp: approved Oct 19 with conditions; completion not verified by Lane F. | Sam, Lane B | archive, section 5 |
| SEO: hubs, specs, C2 to C5 | Hubs live, noindex, no number of any kind. C5 stays out until /cars reads the engine. Lane E's --rows gate before noindex comes off. | Lane C, Lane E | archive, section 6 |
| Engine bumps e60 to e82 | Live through e82. Range definition, window rule, trim-first (RANGE_RULES.trimFirst is true in lib/onebox.js, with the guard), candles, body windows, ladder window. | Lane B | lane-notes |
| Security: F-02, F-29, bhs removal, calculator F-33 and F-34 | Live. F-30 state not re-verified by Lane F. | Lane D (Lane S closed) | lane-notes |
| Leftover-words rule (name any typed word not used; silent list approved Oct 23) | Live (leftover2). | Lane B, Lane C | lane-notes PUSHED 17:43Z Oct 23 |
| Start-page placeholders | Live: Home Corvette, Find Defender (Sam's picks, cc9a8ec7); Market Check "1995 Porsche 911 Carrera". | Lane C | lane-notes |
| copyLint | Three old failures exist on main before Oct 23. Not a gate. | Lane C | lane-notes PUSHED 15:41Z Oct 23 |

## C. Carried items

- USAGE_DASHBOARD_KEY is no longer read (the probe key goes in the x-ops-key header only); delete it from Vercel.
- CURTAIN_TESTER_CODE and TESTER_CODE_EXPIRES: review with the tester-code row.
- Curtain removal is one commit (the curtain block, #curtain and .curtain* CSS, api/crew.js, the robots.txt Disallow, One Box's fate decided in the same commit).
- Run docs/supabase-journeys-schema.sql once if business tracking is wanted from launch.
- After an ENGINE_VERSION bump that changes a car's name: Sam runs "Rebuild VIN rollout cache" (docs/vin-rollout-workflow.yml copied to .github/workflows/vin-rollout.yml), then Lane E reads sitemap-vins.xml for 301s. Applies after Lane B's VIN and naming work, not before.

## Queue watch

Lane F reads docs/lane-notes.md and reports to Sam when a lane has waited more than 20 minutes on another, or when something needs Sam or something landed.
