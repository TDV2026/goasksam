# GoAskSam

Collector car market intelligence platform. Answers "where should I sell my collector car?" with evidence-backed platform recommendations.

- Live: goasksam.vercel.app
- Stack: Vercel serverless (Node.js ESM), Supabase (otkmxyrglikdoychnmvy.supabase.co), OldCarsData API, Claude API
- Deploy: git add / commit / push to main, then `vercel --prod`

## Product rules (locked, never debate these)

1. Sam never invents a statistic. Every number shown to a user must come from real records in the database.
2. Never blast a lead to multiple partners. Single destination only.
3. Backend returns structured facts only. The frontend/Sam layer turns facts into prose. Never mix these.
4. `analysisDate` is when the analysis ran, not a claim about data freshness.
5. Every OldCarsData record fetched gets saved permanently to `vehicle_market_records`. No temporary data ever.
6. Typo corrections always confirm with the user before proceeding ("Did you mean 911?"). Abbreviation expansions (vw to Volkswagen) proceed silently.
7. Natural language input is accepted at every wizard step. Chips are shortcuts, never the only path.
8. Never dead-end with "not enough data." Walk the evidence ladder down and always return a recommendation with honest confidence. The bottom rung is regional policy, clearly labeled as policy rather than data.

## Current architecture (ground truth as of July 2026)

### Supabase tables actually in use
- `vehicle_market_records`: immutable raw auction records. Unique on (source, source_record_id). Source values are real platform slugs (bringatrailer, carsandbids, pcarmarket, hagerty, gooding, rmsothebys, acc/allcollectorcars).
- `vehicle_classifications`: computed classification of records against a search. FK `market_record_id` to vehicle_market_records.id.
- `seller_leads`: lead capture when a seller acts.
- `app_usage_events`: cost and usage logging (OldCarsData metered requests, Anthropic tokens).
- `data_tier_cache`, `recency_thresholds`, `taxonomy`: exist but currently unused by the live path (see Known issues).

### API endpoints
- `POST /api/sellerDecision`: the core engine. Multi-pass widening fetch from OldCarsData, classification into close/relevant/broad/excluded tiers, platform performance analysis, seller activity, route-fit scoring, decision. Persists raw records and classifications.
- `POST /api/vehicleIdentity`: vehicle validation used by the frontend before the wizard proceeds.
- `POST /api/submitSellerLead`: writes seller_leads.
- `POST /api/chat`: Claude wording layer only. Must never invent market performance.
- `GET /api/usageDashboard`: keyed admin dashboard (USAGE_DASHBOARD_KEY).
- `api/_usage.js`: shared cost/usage helpers.
- `api/lookupDataTier.js`: ORPHANED. Frontend never calls it. Slated for deletion once its cache concept is folded into sellerDecision.

### Env vars (Vercel production)
OLDCARSDATA_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, USAGE_DASHBOARD_KEY.
Server-side writes use the service role key. Never expose it in browser code.

### OldCarsData API facts (verified July 2026)
- Sources covered: Bring a Trailer, Cars & Bids, Hagerty, PCAR Market, All Collector Cars, Gooding & Co, RM Sotheby's. Hemmings is NOT covered. All data is auction results; there is no classified-listing data.
- `/auctions` supports `year_min` and `year_max` natively. Use these for year targeting instead of stuffing years into `keyword`.
- `/makes` and `/models` do not count toward the metered request quota. Only `/auctions` is metered.
- Plan: 1K requests/month at $49 (account news@thedailyvroom.com).

## Known issues to fix (found in July 2026 code review)

1. Four separate vehicle parsers exist (vehicleIdentity.js, sellerDecision's resolveVehicle, lookupDataTier's resolveCar, regex in index.html). The frontend validates with vehicleIdentity then sellerDecision re-parses raw text with a weaker parser. Consolidate to one shared resolver and pass the resolved vehicle object through.
2. No typo tolerance for short/numeric models ("9111" fails to match 911) and no make abbreviations (vw, chevy, merc, benz, vette, lambo all unrecognized).
3. The decision layer dead-ends when no close/relevant platform evidence exists, even though widening fetch passes ran. Needs the explicit evidence ladder (see Phase 2).
4. vercel.json is empty but sellerDecision has a 22s fetch budget. Configure `maxDuration` or long searches get killed.
5. No fetch caching in the live path. Thin-market searches can burn 15-20 metered requests (~$1/search). Wire a market-fetch cache (24h, keyed by make|model family).
6. /api/chat and /api/sellerDecision have wildcard CORS and no rate limiting. Cost abuse risk.
7. lookupMarketRecordIds matches on source_record_id only, not (source, source_record_id). Cross-platform ID collisions can mis-link classifications.
8. Records missing an upstream ID get crypto.randomUUID() as source_record_id, re-inserting the same listing every fetch.
9. chat.js pins model claude-sonnet-4-20250514. Should be claude-sonnet-4-6.
10. index.html (~6,400 lines) contains hardcoded fake demo listings with invented Sam commentary. All demo data must be deleted (violates product rule 1).
11. Hemmings exists in ROUTE_POLICIES but can never be evidence-backed (no data source). Mark policy-only or remove until a Hemmings data source exists.
12. Files are too large: sellerDecision.js ~1,200 lines doing six jobs. Split shared logic into lib/ modules.

## The plan (agreed, execute in order)

### Phase 1: One vehicle brain
Build `lib/vehicle.js` used by BOTH vehicleIdentity and sellerDecision.
- Taxonomy tables in Supabase seeded from OldCarsData /makes + /models (free calls) cross-referenced with vPIC for year validity. One-time seed script plus weekly refresh. No hardcoded make/model lists anywhere.
- Alias table: make abbreviations (vw, chevy, merc, benz, vette, lambo, bimmer, etc.), model nicknames, known misspellings.
- Digit-model typo handling: numeric models (911, 356, 458, etc.) get edit-distance-1 matching with a mandatory confirm chip ("Did you mean 911?"). Always confirm corrections; expand abbreviations silently.
- Trim extraction: "Carrera GTS" becomes structured {model: "911", trim: "Carrera GTS"} instead of polluting model matching.
- Frontend passes the resolved vehicle object to sellerDecision. Parsing happens once.

### Phase 2: Evidence ladder
Formalize drawdown as an explicit ordered ladder inside sellerDecision:
1. exact year + trim
2. +/- 2 years, same trim
3. same trim, any year
4. drop trim, same model, +/- 2 years
5. model family, any year
6. make-level context
7. regional policy floor (clearly labeled as policy, low confidence)
The engine walks down until evidence thresholds are met, records which rung it landed on, and decide() always returns a recommendation with honest confidence plus a plain statement of what evidence was used. Use year_min/year_max params for the year rungs. Delete every terminal "not enough data" message; Sam instead narrates the widening ("GTS-specific sales were thin, so I looked at 911 Carrera sales 2015-2019, and here's what that market shows").

### Phase 3: Consolidate and split
- Delete lookupDataTier.js, folding its cache idea into sellerDecision as a market-fetch cache (24h, keyed by make|model family) to cut OldCarsData spend.
- Extract lib/ modules: _ocd.js (OldCarsData client), _supabase.js, _classify.js, vehicle.js.
- Break index.html into modules. Remove all demo/fake listing data.

### Phase 4: Ops hardening
- vercel.json maxDuration for sellerDecision.
- Rate limiting / origin checks on chat and sellerDecision.
- Fix ID lookup to (source, source_record_id); stable source_record_id derivation (hash of source_url as fallback, never a random UUID).
- Fix chat.js model string.

### Later (parked, do not build yet)
- Power seller recommendation engine (keep recommendableNow=false until a verified partner layer exists).
- Selling strategy engine.
- Classified-listing data source (needed before any "classified vs auction" recommendation, e.g. on Hemmings).
- Richer decision UX: Sam narrating a reasoning path instead of presenting raw counts.

## Working style (how Sam the founder wants this run)

- Read the actual code before assuming what's built.
- Make implementation decisions independently; explain what changed and why.
- Stop and ask only for: product decisions, architecture decisions, potentially destructive database changes.
- Complete files or clean diffs, never line-by-line paste instructions.
- Think like a senior lead engineer owning delivery.
- No em dashes or en dashes in any user-facing copy or written content.
