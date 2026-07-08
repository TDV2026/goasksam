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
9. Powerseller lead is GATED, never default. Leading with a partner requires ALL of: estimated value from actual comps above POWERSELLER_MIN_VALUE_USD (75000, env-overridable), car segment matching the partner's specialties, seller region within partner coverage, and an active matching partner in the partners table. Any condition fails: platform recommendation is primary and no powerseller card renders.
10. User preference always wins. When the powerseller gate passes, present the choice (have it handled vs run it yourself). If the user indicates DIY at any point, platform becomes and remains primary and the powerseller drops to a one-line secondary. Never re-pitch after a stated DIY preference. User-initiated requests for the partner are always fine.
11. No unsupported money claims. Never state as fact that a powerseller gets the seller more money. Service framing only (handles listing, photography, buyer questions, platform choice). Partner claims render with their source: partner_provided shows with attribution ("per howS"); data_verified is computed from vehicle_market_records at request time and only then reads as market data.
12. No-repeat and off-script chat routing are global invariants across EVERY wizard state and sub-state: repeated failed input must escalate with different wording, and off-script input routes to the chat layer for a real answer before the wizard re-asks.
13. Clarification questions never assert facts we have not checked (no "X made a lot of different cars"). A make with exactly one known model auto-resolves silently.
14. Platforms are judged model-specific (where do comps for THIS car sell best); powersellers are judged on their entire body of work. A consignor who has sold hundreds of high-end cars and many Porsches is credible for a 911 GTS even if he has never sold that exact trim-year. Partner stats are therefore computed over the partner's ENTIRE tracked sales history via their seller usernames, never scoped to the current search's comparable records.

## Current architecture (ground truth as of July 2026)

### Supabase tables actually in use
- `vehicle_market_records`: immutable raw auction records. Unique on (source, source_record_id). Source values are real platform slugs (bringatrailer, carsandbids, pcarmarket, hagerty, gooding, rmsothebys, acc/allcollectorcars).
- `vehicle_classifications`: computed classification of records against a search. FK `market_record_id` to vehicle_market_records.id.
- `seller_leads`: lead capture when a seller acts.
- `app_usage_events`: cost and usage logging (OldCarsData metered requests, Anthropic tokens).
- `market_fetch_cache`: 24h market-fetch cache rows (Phase 3), one per make|model family.
- `taxonomy_generations`: model generation ranges (Phase 4), seeded by npm run seed:generations from lib/generations.js.
- `narration_cache`: chat wording cache rows keyed by payload hash (cost hardening).
- `data_tier_cache`, `recency_thresholds`, `taxonomy`: exist but unused by the live path (legacy; safe to drop).

### API endpoints
- `POST /api/sellerDecision`: the core engine. Multi-pass widening fetch from OldCarsData, classification into close/relevant/broad/excluded tiers, platform performance analysis, seller activity, route-fit scoring, decision. Persists raw records and classifications.
- `POST /api/vehicleIdentity`: vehicle validation used by the frontend before the wizard proceeds.
- `POST /api/submitSellerLead`: writes seller_leads.
- `POST /api/chat`: Claude wording layer only. Must never invent market performance.
- `GET /api/usageDashboard`: keyed admin dashboard (USAGE_DASHBOARD_KEY).
- `api/_usage.js`: shared cost/usage helpers.

### Env vars (Vercel production)
OLDCARSDATA_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, USAGE_DASHBOARD_KEY. Optional: OCD_DAILY_REQUEST_BUDGET caps fresh OldCarsData spend per day (default 33, plan pace); SAM_MODEL overrides the chat wording-layer model (defaults to claude-sonnet-4-6 in api/chat.js); never set it to a dated snapshot.
Server-side writes use the service role key. Never expose it in browser code.

### OldCarsData API facts (verified July 2026)
- Sources covered: Bring a Trailer, Cars & Bids, Hagerty, PCAR Market, All Collector Cars, Gooding & Co, RM Sotheby's. Hemmings is NOT covered. All data is auction results; there is no classified-listing data.
- `/auctions` supports `year_min` and `year_max` natively. Use these for year targeting instead of stuffing years into `keyword`.
- `/makes` and `/models` do not count toward the metered request quota. Only `/auctions` is metered.
- Plan: 1K requests/month at $49 (account news@thedailyvroom.com).

## Known issues to fix (found in July 2026 code review)

1. FIXED July 2026 (Phase 1): lib/vehicle.js is the one shared resolver. vehicleIdentity is a thin wrapper over it, sellerDecision accepts the resolved vehicle object from the frontend (car.vehicle) and only re-resolves raw text through the same resolver as a fallback. The frontend's silent spelling-correction regex layer was deleted. Remaining parser debt: lookupDataTier's resolveCar dies with that file in Phase 3, and index.html still has local clarification chip helpers (MAKE_MODEL_CLARIFICATIONS) that go away with the Phase 3 frontend split.
2. FIXED July 2026 (Phase 1): make abbreviations and model nicknames (vw, chevy, merc, benz, vette, lambo, bimmer, fj40, etc.) expand silently; numeric-model edit-distance-1 typos (9111) and fuzzy model/make typos return a mandatory "Did you mean" confirmation. Curated data lives in lib/vehicleData.js and seeds the taxonomy_aliases table.
3. FIXED July 2026 (Phase 2): the explicit evidence ladder lives in sellerDecision. decide() never returns a null recommendation; the bottom rung is the regional policy floor with evidenceBasis "regional_policy" and confidence "low".
4. vercel.json is empty but sellerDecision has a 22s fetch budget. Configure `maxDuration` or long searches get killed.
5. FIXED July 2026 (Phase 3): market-fetch cache in sellerDecision, 24h, keyed by make|model family. Needs docs/supabase-market-fetch-cache.sql applied once.
6. /api/chat and /api/sellerDecision have wildcard CORS and no rate limiting. Cost abuse risk.
7. lookupMarketRecordIds matches on source_record_id only, not (source, source_record_id). Cross-platform ID collisions can mis-link classifications.
8. Records missing an upstream ID get crypto.randomUUID() as source_record_id, re-inserting the same listing every fetch.
9. FIXED July 2026: chat.js now pins claude-sonnet-4-6. The old pinned snapshot claude-sonnet-4-20250514 was retired by Anthropic (404 model not found), which silently killed the chat layer in production: the frontend never checked res.ok and fell back to a generic filler line. Chat errors now log to app_usage_events, the frontend shows an honest "having trouble answering right now" message instead of filler, and `npm run smoke:prod` asserts on chat response content so a dead chat layer fails loudly.
10. FIXED July 2026 (Phase 3): all demo data deleted (fake LISTINGS, DEMO_SIGNALS, scout card layer).
11. FIXED July 2026 (Phase 2): ROUTE_POLICIES now carries evidenceCapable flags. Hemmings, Car & Classic and Collecting Cars are marked evidenceCapable: false (no OldCarsData coverage); they can only ever be policy recommendations and route objects expose the flag.
12. FIXED July 2026 (Phase 3): shared logic extracted to lib/_ocd.js, lib/_supabase.js, lib/_classify.js; index.html split into styles.css + seven js/ modules.

## Input pipeline architecture (locked, July 2026)
Every user input in the sell flow passes through the SELL INPUT PIPELINE module (js/pipeline.js since the Phase 3 split) before any state handler may store or act on it. Stages: intent detection (affirmation/negation/refusal/move-on via INTENT_PATTERNS + detectIntent), off-script question routing to the chat layer (isQuestionInput), per-state answer-shape validation and normalization (STEP_SPECS + pipelineProcess), rotating escalation for unrecognized input (escalateStep), and a global no-repeat backstop inside addMsg (no Sam text ever renders twice consecutively). States routed through it: the pre-wizard entry state (cold vehicle text resolves and starts the wizard, unmatched input probes the resolver then falls to real chat), the vehicle step, both step-17 sub-states (clarification and trim detail), every chip question (mileage, condition, records, title, price, timeline), free-text steps (state, notes), region/state, the confirmation step, and post-result chat. Raw utterances can never reach sellState, the confirm card, or the lead payload. Adding a wizard state means declaring it in STEP_SPECS; the per-state smoke harness (scripts/smokeWizard.js) runs every declared state through the pipeline so a new state cannot regress silently.

Decision coherence (locked): evidence-only consignment houses (RM Sotheby's, Gooding, ACC) are routable:false, can never be the pick or a comparison card, and a stronger non-routable source is always explained with its concrete reason. Result chips, bullets and headlines derive from one routeFacts object with consistency rules. All source slugs map to display names (platformDisplayName). Result framing: comparison-led or every-sale-closed-here, never small-sample fractions as headlines; weekday timing insights sit in the headline bullets with grounding. The involvement question does not exist; Sam gives his gated powerseller opinion at the result, and a stated DIY preference permanently suppresses re-pitching. Chat grounding: the chat layer never contradicts the engine's recommendation (decision facts are injected into post-result context), never states platform mechanics or fees as fact, never invents market commentary.

## The plan (agreed, execute in order)

### Phase 1: One vehicle brain (SHIPPED July 2026, one manual step pending)
Built `lib/vehicle.js`, used by BOTH vehicleIdentity and sellerDecision.
- Taxonomy: Supabase tables taxonomy_makes / taxonomy_models / taxonomy_aliases (docs/supabase-taxonomy-schema.sql) seeded from OldCarsData /makes + /models via scripts/seedTaxonomy.js (npm run seed:taxonomy). Year validity comes from curated production ranges plus runtime vPIC lookups (cached per instance). The resolver falls back to live OldCarsData/vPIC (free calls) whenever the tables are empty or Supabase is unreachable, so nothing breaks pre-seed.
- PENDING MANUAL STEP: run docs/supabase-taxonomy-schema.sql in the Supabase SQL editor, then `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:taxonomy` locally. Secrets are marked sensitive in Vercel so they cannot be pulled with `vercel env pull`.
- Alias layer: abbreviations and nicknames expand silently; misspellings and edit-distance matches always return a confirm chip ("Did you mean the Porsche 911?"). Curated source of truth is lib/vehicleData.js; DB rows override once seeded.
- Trim extraction works: "2018 Porsche 911 Carrera GTS" resolves to {model: "911", trim: "Carrera GTS"} and trim feeds the exact fetch pass keyword.
- Frontend stores the validated vehicle in sellState.resolvedVehicle and passes it to sellerDecision as car.vehicle. Parsing happens once.

### Phase 2: Evidence ladder (SHIPPED July 2026)
The explicit ordered ladder lives in sellerDecision (buildLadder/evaluateLadder):
1. exact year + trim (threshold 3)
2. +/- 2 years, same trim (3) [calendar-based, to be replaced by generation-aware rungs in Phase 4]
3. same trim, any year (4)
4. drop trim, same model, +/- 2 years (3) [same Phase 4 note]
5. model family, any year (6)
6. make-level context, +/- 8 years (6)
7. regional policy floor (decide() fallback, evidenceBasis "regional_policy", confidence "low")
Rungs collapse sensibly when the vehicle has no trim. Fetching is rung-by-rung with native year_min/year_max params (no years stuffed into keyword), a keyword fallback pass per rung when the model param finds nothing, and an early stop the moment a fetched rung meets its threshold (a rung-1 hit costs 1 metered request). Rung evaluation is rung-primary, window-secondary (45/90/180 days): specificity beats recency. If no rung meets threshold, the analysis lands thin on the narrowest rung with any evidence; if zero evidence, decide() recommends from route policy. Confidence maps from the landed rung (high needs a met trim/exact rung with 5+ sales). The response carries evidence.ladder {landed, rungs walked with counts}; the frontend narrates the widening from those structured facts and its "not enough data" dead-ends were removed (the polished regional card still renders for UK/Europe/international policy-basis decisions).

### Phase 3: Consolidate and split (SHIPPED July 2026, one manual step pending)
- lookupDataTier.js deleted.
- lib/ modules: _ocd.js (OldCarsData client), _supabase.js (supabaseEnv/supabaseSelect/supabaseInsert), _classify.js (classifyRecord plus shared record/text utils), vehicle.js, vehicleData.js. sellerDecision imports from all of them.
- Market-fetch cache live in sellerDecision: 24h, keyed by make|model family (market_fetch_cache table). A hit serves stored records from vehicle_market_records at zero metered requests; only healthy fetches stamp the cache; everything degrades silently if the table is missing.
- PENDING MANUAL STEP: run docs/supabase-market-fetch-cache.sql in the Supabase SQL editor to activate the cache.
- index.html is a thin shell (~60 lines) loading styles.css and js/ modules in order: wizard.js, pipeline.js, steps.js, result.js, chat-core.js, result-copy.js, entry.js. Classic scripts sharing global scope; load order matters and the concatenation must stay equivalent to one script. Both smoke harnesses load the concatenation the same way.
- All demo data deleted (fake LISTINGS, DEMO_SIGNALS, scout card/modal layer, the stale Cars & Bids auction-mechanics line in SELL_SYS, dead sessionContext enrichment).

### Phase 4: Generation-aware evidence ladder (SHIPPED July 2026, one manual step pending)
The year-widening rungs should follow model generations, not calendar +/- 2 years. A 2011 911 (997) and a 2013 911 (991) are different markets even though they are 2 years apart; a 1969 and 1973 911 are the same market even though they are 4 apart. Revised ladder:
1. exact year + trim
2. same generation + trim
3. same trim, any year (labeled cross-generation)
4. drop trim, within generation
5. model family, any year
6. make-level context
7. regional policy floor
- Requires a generation mapping in the taxonomy: (model, year_start, year_end, generation code), e.g. 911 -> 996 1999-2004, 997 2005-2012, 991 2012-2019, 992 2019+. Add to the taxonomy schema and seed script.
- Seed starting with high-volume collector models; expand coverage over time.
- Where no generation mapping exists for a model, rungs fall back to calendar +/- 2 years (the current shipped behavior). Never block on missing mappings.
- Side benefit: OldCarsData files some generations as their own models (997 vs 911), so generation-aware fetching can query those model codes directly instead of relying on the keyword fallback pass.

Shipped implementation (July 2026):
- lib/generations.js: curated CURATED_GENERATIONS (911, M3/M5/M2, 3-Series, Corvette, Camaro, Chevelle, Mustang, Bronco, Miata, Land Cruiser, Supra, Beetle/Bus eras, SL, Skyline, E-Type, Charger, Challenger, Boxster/Cayman, 356) with DB override from taxonomy_generations. Ambiguous handover years (1989 911, 1981-83 Land Cruiser) are deliberately unmapped: prefer gaps over guesses, a wrong boundary poisons comps.
- MANUAL STEP PENDING: run docs/supabase-generations-schema.sql, then `npm run seed:generations` (also derives chassis-code alias rows and prints a records-coverage report naming the next seed candidates).
- Ladder: generation rungs replace the calendar +/- 2 rungs only when the year maps (keys generation_trim / generation_model, labels like "991.2-generation 911 Carrera GTS sales, 2017 to 2019"; any_year_trim is labeled cross-generation). Unmapped models keep production behavior exactly. Chassis-code generations also try their code as an OCD model param when the rung is unmet.
- Coverage grows from demand: every decision logs metadata.generationMapped and metadata.generation to app_usage_events; unmapped-ladder demand (generationMapped=false grouped by make/model) is the source for the next seed additions.
- sellerDecision accepts ladderPreview:true for a fetch-free, write-free ladder structure preview (used by smoke assertions).

### Cost hardening (SHIPPED July 2026, manual SQL pending)
- Narration cache: api/chat.js caches every successful reply in narration_cache keyed on sha256(model + system + context + messages). Identical facts reuse the stored narration at zero Anthropic cost; changed facts change the key, so invalidation is inherent. Requests may pass bypassCache:true (the smoke suite does, so a dead chat layer still fails loudly). Run docs/supabase-narration-cache.sql once to activate.
- OCD daily budget guard: sellerDecision sums the day's metered requests from app_usage_events before any fresh fetch. Past OCD_DAILY_REQUEST_BUDGET it logs an ocd_budget_guard event (loud, queryable) and soft-degrades to stored records or the policy floor; it never spends past plan pace and never dead-ends.

### Phase 5: Ops hardening
- vercel.json maxDuration for sellerDecision.
- Rate limiting / origin checks on chat and sellerDecision.
- Fix ID lookup to (source, source_record_id); stable source_record_id derivation (hash of source_url as fallback, never a random UUID).
- Fix chat.js model string.

### Partner (PowerSeller) layer (SHIPPED July 2026)
Partners live in the Supabase partners table (docs/supabase-partners-schema.sql, seeded by npm run seed:partners). Every claim carries a source: partner_provided renders with attribution, data_verified is computed at request time from vehicle_market_records via the partner's seller_usernames (tracked sales count, top makes, platforms seen). sellerDecision evaluates the locked gate (product rules 9-11) and returns decision.partnerReferral; the frontend renders entirely from it. The old hardcoded frontend partner array (real howS content plus four invented placeholders) is deleted. Leads to a partner route through submitSellerLead with destinationType "powerseller", single destination as ever. Setup: run the partners SQL once, then seed.
- Schema applied and seeded July 2026; the gate is live in production. Re-run npm run seed:partners after editing partner content. SUPABASE_SERVICE_ROLE_KEY is set in Vercel so the deployed functions read the partners table directly.

### Later (parked, do not build yet)
- Comp-backed price answer at the price step: when the seller says "you tell me", answer with the median from actual comparable sales before re-asking. Requires comps at question time (today the analysis runs after the wizard), so it needs either a cheap pre-fetch or reordering. Until then the step normalizes to "Not sure".
- Condition-aware analysis (mileage, modifications, records adjusting the market read). Today the result only adds an honest framing caveat when stored answers are materially adverse; no numbers are adjusted or invented.
- Data-derived consignor premium: compute professional-consignor vs private-seller results on comparable cars from our own records. Once it exists and is verified, "a consignor improves the result" becomes a data_verified claim; until then it may never be stated (product rule 11).
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
