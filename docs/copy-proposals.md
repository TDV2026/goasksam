# Copy length proposals (Lane E, Sunday Nov 1 2026)

Four lines in `data/copy.json` are over the length rule. Nothing here is applied: `data/copy.json` is unchanged and nothing is pushed. Sam or a developer pastes the "Proposed" text into the file, then deletes the matching entry from the allowance list in `scripts/copyCheck.mjs` (`KNOWN_LONG`, `KNOWN_LONG_DESC`).

The rule is a title under 60 characters and a description under 160. The allowances (80, 63, 165, 160) are the lengths the lines had on Nov 1, so each proposal below fits the real rule, which also fits the allowance.

Rules each proposal follows: no dashes, no competitor names, no source or auction house counts, no "AI" as a selling word, no first person, no "valuation".

`scripts/copyProposalsCheck.mjs` reads the blocks below. It fails if a Current line no longer matches `data/copy.json`, if a count is wrong, if a Proposed line breaks a rule or the length, or if a line on the allowance list has no proposal.

## home.TITLE
- Limit: 59 (allowance 80)
- Current (80): GoAskSam | Find enthusiast cars at auction, check what they sell for, sell yours
- Proposed (58): GoAskSam | Find enthusiast cars, see what sold, sell yours
- Kept: the three jobs in the same order. Dropped: "at auction" (the description carries it) and "what they sell for" becomes "what sold".

## find.TITLE
- Limit: 59 (allowance 63)
- Current (63): Find enthusiast cars at auction, by what they actually sell for
- Proposed (54): Find enthusiast cars at auction, by what they sell for
- Kept: everything but "actually".

## home.DESC
- Limit: 159 (allowance 165)
- Current (165): Tell Sam what you want and search live enthusiast car auctions in your own words, see what similar cars have actually sold for, and find where and how to sell yours.
- Proposed (148): Tell Sam what you want, search live enthusiast car auctions in your own words, see what similar cars sold for, and find where and how to sell yours.
- Kept: all four ideas. Dropped: "have actually".

## about.DESC
- Limit: 159 (allowance 160)
- Current (160): GoAskSam reads real auction sales to show what cars are bringing, find live cars that fit, and tell you where to sell. Built by the team behind The Daily Vroom.
- Proposed (155): GoAskSam reads real auction sales to show what cars are bringing, find live cars that fit, and say where to sell. Built by the team behind The Daily Vroom.
- Kept: all of it. Changed: "tell you where to sell" to "say where to sell".
