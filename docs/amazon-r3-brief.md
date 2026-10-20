# Amazon demo, revision 3: lane brief (written by Lane F, Oct 20 2026)

You are a screens lane for the GATED Amazon Autos partner demo of GoAskSam. Read first: docs/lane-notes.md (the last 300 lines, especially "FROM SAM ... AMAZON DEMO, REVISION 3", which holds Sam's order word for word), CLAUDE.md (product rules, especially 1, 8, 20, 22 to 28 and the Search and AI citation section), and docs/search-rules.md.

## What exists (live behind the gate since Oct 20)
- api/_amazonDemo.js: the demo page (server-rendered shell plus a client script): tabs a (Before shopping), b (Dealer lists a car), c (On the listing), d (In search results); the shared Market Check card comes from the partner answer path (api/partnerAnswer.js), which wraps the one engine (oneEngineAnswer). The page computes nothing.
- api/_amazonDemoCars.js: AMAZON_DEMO_CARS, the seven approved demo cars (each by its own listing title, with a named sample sale: date, stated mileage, photo) and the fixed per-car sample constants (price, monthly) in the partner profile data.
- Checks in scripts/: amazonR2Check, amazonCaseCheck, amazonGridCheck, amazonTypedCheck, amazonCarsCheck, amazonScopeCheck, partnerDemoInertCheck, partnerEngineMatch, photoWidthCheck, demoStoredCheck; they run in prePush.
- Preview path (Sam only, with the partner code he holds in Vercel and his Keychain): /preview?p=amazon&view=a|b|c|d&car=...  The partner code NEVER appears in any file, log, output or message.
- Reference: Sam's screenshots (paths in lane-notes). The real Amazon listing screenshot shows a sponsored banner and a license plate: neither is reproduced.

## Hard rules
Every figure, line and range comes from the shared card (one engine); the partner profile controls presentation only; every control is inert except tab navigation, the car box, the tab a and tab b boxes and Show/Hide of Market Check; no auction site names, no outbound links except our own "How Sam decides"; no source counts, no "our data", no "AI" label, no first-person Sam, no em or en dashes; fonts are Arial and Helvetica only (never load Amazon's font files); "Demo", "Prepared for Amazon" and every "Sample" label stay; nothing goes to Amazon until Sam says. Revert at once on any changed count, range or line, a blank module, or a control that does something.

## Push protocol (shared by every lane)
One FULL prePush alone per push (about 11 minutes); a lock is a line "- PUSH LOCK (Lane X, <time>): ..." in docs/lane-notes.md and is open until a later "- PUSHED" or "- LOCK RELEASED" line from the same lane; take a lock only when none is open, after git fetch and rebase; name any other lane's non-docs files that changed in your overlap line; push only on 0 FAIL (one clean re-run for a lone timing line); no production read, even read-only, while any lock is open; look after Ready (about 4 minutes) and post "- LOOK DONE (Lane X, <time>): ..." in lane-notes FIRST; watchers match line starts only; no hard resets; stage files by name; deploy by pushing to main only.

## Stages (Sam's order)
R3-A items 1 and 2 (one car across all tabs; the decoded name and VIN under every box); R3-B items 3, 4 (after Sam approves the Market Check row line) and 5 (listing page block, the inviting Market Check row, the sales list design with at most 10 sales then Show more); R3-C items 6 and 7 (search results like the reference, the Amazon look); item 8 when Sam picks the SLS sample. Plan first in lane-notes, build locally on a branch from main, a check per item, a look per stage.
