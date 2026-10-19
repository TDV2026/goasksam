// One Box: "what have cars like yours actually sold for" from our own archive.
// Archive-only (never a live OldCarsData call), read-only, no persistence. Given a
// resolved vehicle + optional generation, it selects a single honest result tier
// (3+/2/1/0) from genuinely comparable STOCK sales and returns the display facts.
//
// Locked product invariants encoded here:
// - Comp candidates are filtered to stock + same variant BEFORE selection, never
//   sorted-then-shown (a modified/backdated car never stands in for a stock one).
// - Time window is a hard deterministic ceiling: 12 months first; if fewer than 3
//   qualifying sales, expand ONCE to 24 months; stop. Never widen further.
// - The larger qualifying set is used ONLY to choose the result. At most three
//   cards are ever returned; the dataset is never exposed (no see-more of any kind).
// - Outliers/specials are filtered out and returned nowhere.
// - No valuation number, no counts beyond the single scoped stat (count + window).
import { supabaseSelect as _sbSelect, supabaseSelectAll as _sbSelectAll, verifyExactCount } from "./_supabase.js";
import { AsyncLocalStorage } from "node:async_hooks";
// AS-OF CLOCK (e65, Sam's item 3, diagnosis only): task=obdiag&asOf=YYYY-MM-DD runs the engine on the pool as it stood on that
// date: every window counts back from the as-of date, and every sales_archive read is bounded to sales on or before it. Only
// runWithAsOf sets the clock; with no as-of date obNow() is Date.now() and every query string is unchanged, so no visitor
// answer can differ. The store is per request (AsyncLocalStorage), never a global, so concurrent requests never share it.
const OB_CLOCK = new AsyncLocalStorage();
export function obNow() { const st = OB_CLOCK.getStore(); return st && Number.isFinite(st.asOfMs) ? st.asOfMs : Date.now(); }
function obAsOfDate() { const st = OB_CLOCK.getStore(); return st && st.asOfDate ? st.asOfDate : null; }
// keepHouse (e65, Sam item 5, diagnosis only): task=obdiag&keepHouse=1 runs the engine with the online-band house drop
// switched off, so the read shows what the answer would be if house sales stayed in. Never set on a visitor read.
function obKeepHouse() { const st = OB_CLOCK.getStore(); return !!(st && st.keepHouse); }
export function runWithAsOf(asOfDate, fn, opts = {}) {
  const okDate = /^\d{4}-\d{2}-\d{2}$/.test(String(asOfDate || ""));
  if (!okDate && !opts.keepHouse) return fn();
  return OB_CLOCK.run({ asOfDate: okDate ? String(asOfDate) : null, asOfMs: okDate ? Date.parse(`${asOfDate}T23:59:59Z`) : NaN, keepHouse: !!opts.keepHouse }, fn);
}
const _asOfQ = q => { const d = obAsOfDate(); return d && /^sales_archive\?/.test(String(q)) ? `${q}&sale_date=lte.${d}` : q; };
const supabaseSelect = (env, q, ...rest) => _sbSelect(env, _asOfQ(q), ...rest);
const supabaseSelectAll = (env, q, ...rest) => _sbSelectAll(env, _asOfQ(q), ...rest);
import { driversForVehicle, driverByKey } from "./driverDict.js";
import { modelChipsForMakeYear } from "./vehicle.js";
import { familyFor, familyBadgeMatch } from "./modelFamilies.js";
import { CURATED_GENERATIONS, generationsForModel, generationModelToken, bodyGenCode as mrBodyGenCode, trimEraCodes, halfGenerationFor, halfForYear } from "./generations.js";
import { deskModelFamily as mrModelFamily } from "./desk/familyKey.js";
import { bodiesForYear, variantMarketFor, variantMarketsFor, rulesFor as mrRulesFor, yearInRuleGenerations, denyFor as mrDenyFor, restomodReason, specialEditionRes as mrSpecialEditionRes, askableVariant as mrAskableVariant, generationsForRules as mrGensFor, bodiesForGeneration as mrBodiesForGen, bodiesForTrim as mrBodiesForTrim, bodyLabelFor as mrBodyLabel, canonicalName as mrCanonical, defaultBodyFor as mrDefaultBody, gearboxForGeneration as mrGearboxFor, generationForTrimYear as mrGenForTrimYear, bodyFamilyEq as mrBodyEq, _norm as mrNorm, trimFamilyFence, modelFamilyGroup, familyForText, siblingFor as siblingModelFor, gearboxDefinesMarketFor } from "./modelRules.js";

// Cobra replica / kit builders that carry a genuine displacement in the title (so the family include
// would otherwise keep them) but are NOT originals or official continuations - dropped from any Cobra
// family pool (item 2). The generic replica/kit/-style flag (isMemorabilia) catches the "...Replica"
// and "...kit" titles; this adds the builder NAMES that a title may carry without the word "replica".
const COBRA_REPLICA_RE = /\b(superformance|factory\s?five|\bffr\b|backdraft|kirkham|\bCAV\b|\bRCR\b|safir|shell\s?valley|everett[-\s]?morrison|unique\s?motorcars|classic\s?roadsters?|contemporary\s?classic|west\s?coast\s?cobra|midstates?)\b/i;

// Normalize a garbled auction title enough for trim-family matching (item 2 fix): strip the id clauses
// a house tacks on and DE-GLUE a doubled token ("...Turbo GT2 RGT2 R VIN..." -> "...Turbo GT2 R"),
// mirroring the display cleanup. Without this the fence runs on the raw title, where the glued "RGT2 R"
// defeats /\bgt2\s*r\b/ and a GT2 R leaks into a road GT2 pool. Server-side so the fence sees the same
// clean token the card shows.
function normalizeTitleForTrim(t) {
  let s = String(t == null ? "" : t);
  s = s.replace(/\s*\b(?:vin|chassis|engine|transmission|gearbox|body)\b\.?\s*(?:no\.?|number|#)?\s*:?\s*\*?[A-Za-z0-9][A-Za-z0-9*/\-]{4,}\*?/ig, "");
  s = s.replace(/\s*["'‘’“”]\s*type\s+[A-Za-z0-9.\/-]+\s*["'‘’“”]/ig, "");
  s = s.replace(/\b([A-Za-z])([A-Za-z]*\d[A-Za-z0-9]*)\s+\1\b/g, "$2 $1");                                   // de-glue "RGT2 R" -> "GT2 R"
  s = s.replace(/\b((?:[A-Za-z0-9][A-Za-z0-9/.\-]*\s+){0,2}[A-Za-z0-9][A-Za-z0-9/.\-]*)(?:\s+\1\b)+/ig, "$1"); // collapse doubled token
  return s.replace(/\s{2,}/g, " ").trim();
}
// Apply the race/road trim-family fence (item 2) to an already-trim-scoped list. A race trim pools
// ONLY its family (GT2 R + GT2 Evo); a road badge drops its race siblings. raw is the unscoped pool
// (used when a race family's onlyRe needs to pull siblings the trim-title scope excluded), scoped is
// the trim-title-scoped pool. Titles are normalized first so a glued/garbled raw title cannot defeat
// the fence. Returns the fenced list, or scoped unchanged when no fence applies.
function applyTrimFamilyFence(make, model, trimName, raw, scoped, titleOf) {
  const fence = trimName ? trimFamilyFence(make, model, trimName) : null;
  if (!fence) return scoped;
  const norm = r => normalizeTitleForTrim(titleOf(r));
  if (fence.onlyRe) return raw.filter(r => fence.onlyRe.test(norm(r)));
  if (fence.excludeRe) return scoped.filter(r => !fence.excludeRe.test(norm(r)));
  return scoped;
}

// Gearbox TYPE from the title + transmission field (Part 1 Rule 2): the manual-vs-paddle split that
// the gearbox question is built on. "F1"/SMG/PDK/DCT/E-gear/Sportshift/Tiptronic/paddle/automatic ->
// auto; manual/gated/stick (and a bare "6-speed" with no paddle marker, since the F1 cars are titled
// "F1") -> manual; nothing recognizable -> null (excluded from a gearbox-filtered pool, never guessed).
function gearboxType(row) {
  const t = (titleOf(row) + " " + String(row.transmission || "")).toLowerCase();
  if (/\bf1\b|\bsmg\b|\bpdk\b|\bdct\b|e-?gear|sportshift|paddle|automated|dual[-\s]?clutch|tiptronic|\bauto(matic)?\b|\bdsg\b|\btct\b|\bf1[-\s]?matic\b/.test(t)) return "auto";
  if (/\bmanual\b|\bgated\b|\bstick\b|\d-?speed\s?manual\b/.test(t)) return "manual";
  // A BARE "N-speed" is UNKNOWN for a MODERN car (a dual-clutch 458 lists "7-Speed" with no paddle
  // word and must never be read as a stick). But before the dual-clutch/automated-manual era a
  // traditional automatic was ALWAYS named ("automatic"/"Tiptronic"/"Steptronic", caught above), so a
  // bare "4/5/6-speed" on a PRE-2005 car is a manual. This recovers the pre-997 911 manuals (964/993/
  // 3.2 Carrera, etc.) whose structured transmission field is blank and whose titles read "5-Speed" -
  // without this they were dropped from a manual-filtered pool (a "1992 Carrera 2 manual" read 0).
  const yr = Number(row.year) || Number((String(titleOf(row)).match(/\b(19|20)\d{2}\b/) || [])[0]) || 0;
  if (yr && yr < 2005 && /\b[1-6][-\s]?speed\b/.test(t)) return "manual";
  return null;
}
// The maker's own name for the non-manual box, for the chip ("Manual or F1?").
function autoGearboxLabel(rule, genCode) {
  const mk = mrNorm(rule && rule.make);
  if (mk === "ferrari") return "F1";
  if (mk === "lamborghini") return "E-Gear";
  if (mk === "astonmartin") return "Sportshift";
  if (mk === "porsche") return "PDK";
  if (mk === "bmw") return mrNorm(genCode) === "e46" ? "SMG" : "DCT";
  return "Automatic";
}
import { dedupBySaleIdentity, hammerUsd, priceDisplay, nativePrices, mileageInfo, isHouseSource, toUsd, sourceSlugOf, ensureFxReady } from "./_houseComps.js";
import { isPartsListing, isMemorabilia, isPrototype, extractMarkers, markerLabel, projectFlagReason, titleKeywordPool, marketCountry, inMarket, stampCountry } from "./_classify.js";
import { humanTitle } from "./carTitle.js";
import { applyRowCorrections } from "./_corrections.js";

// ENGINE_VERSION (Step 0): bumped on any change to how the engine resolves, scopes, widens, excludes
// halos, picks tiers, or computes a read. It is mixed into every persistent cache key (market fetch
// cache + any decision cache) so an engine change can never serve a pre-change answer from cache.
// Bump this whenever Engine A behaviour changes. 2026-10-01: tier-gate + Fix-7 + Pierce consolidation.
// 2026-10-10 (M3 Competition mismatch job): spec_market_cache (lib/live/search.js) never actually
// carried this stamp despite the comment above saying "every persistent... decision cache" - it had
// its OWN, separately-bumped SPEC_V, so an engine change that bumped THIS constant (or bumped
// neither) could leave a spec_market_cache row "valid" (right SPEC_V, within SPEC_TTL) for up to 6h
// after the row's own computed answer was already wrong. Now wired in (see lib/live/search.js
// prefetchSpecs); bumped here once to force every existing row to recompute under the current engine.
// 2026-10-10 (half-generation job): buildSpec's year-window logic changed (987 Boxster/Cayman now
// narrow to 987.1/987.2 when a year pins one) and pickRepresentative's three context cards now
// prefer same-half sales (997, 987, E46 M3) - a cached row computed before this change could keep
// serving the OLD merged-987 window or a cross-half context card for up to SPEC_TTL. Bumped again.
// 2026-10-10 (trim contamination fix): qualifyReason's titleContains check was backwards (a lenient
// substring pass skipped the strict word-boundary regex whenever the substring was present at all -
// true for almost every title) and had no guard against a bare trim ("S") being satisfied by a
// longer compound trim in the SAME title ("Turbo S", "GTS") - fixed both; a cached row built under
// the old, contaminated pool must never be served past this point.
// 2026-10-10 (count reconciliation job, part 2): the e6 bump above landed BEFORE coreOf/
// listingMarket (lib/live/search.js) were updated to pass `counts` through to Buy/Tasks' own
// read - confirmed live, a row cached in that narrow window matched e6 (so it read as fresh) but
// carried no `counts` field at all, since it predated the passthrough fix. A version bump changes
// the SHAPE a cache row carries, not just whether its ANSWER is current - bumping again closes
// that gap cleanly rather than waiting out the TTL.
// 2026-10-10 (body-style scoping job): buildResult now computes a real bodyScoped boolean (true/
// false/null - see its own comment) - lib/live/search.js coreOf/listingMarket and lib/tasks/
// tasks.js were already reading this field in anticipation, always getting null before this point
// (the field never existed). specKeyFor already includes v.bodyStyle in the cache key (no new split
// dimension - body was always part of the key), so the version bump alone forces the shape change
// to propagate rather than waiting out the TTL.
// 2026-10-10 (body-style scoping job, follow-up): bodyScoped now also recognizes the Targa/
// Speedster body-hint-via-trim case (a bare "911 Targa" keeps the word in spec.trim, not
// spec.bodyStyle - a pre-existing, documented resolver choice). Bumped again.
// 2026-10-11 (label-vs-sales mismatch job): the model rung's resolvedCar now drops the trim when
// the evidence ladder widens past it (a thin "Shelby GT500 Supercharged" rung reading as plain
// Mustangs no longer keeps the dropped trim in its label). A cached thin/model-widened row built
// before this point carries the stale, now-wrong trim in resolvedCar/familyLabel - bumped again.
// 2026-10-11 (label-vs-sales mismatch job, root cause): buildSpec now falls back to a literal
// titleContains fence for any trim that matched none of the curated scoping mechanisms (the actual
// cause of the Shelby GT500 Supercharged case - the pool was NEVER filtered to the trim at all, not
// merely widened past it). A cached row for an uncurated-trim query was built from the whole base
// model and must be refused, not served until its TTL expires.
// 2026-10-11 (label-vs-sales mismatch job, follow-up): the above fallback was wrongly gated on
// !spec.perfInclude - runOneBox's own famSpec clears perfInclude before the real fetch runs, so for
// any make relying on PERF_TRIMS with no subTrimFence backstop (Ford Shelby/GT350/GT500/Boss/SVT)
// the fallback never fired and the pool stayed completely unfiltered. Now set regardless of
// perfInclude. A cached row for one of these trims was built with zero trim filtering and must be
// refused.
// 2026-10-11 (comparable-fences job): modified/restomod set-aside widened from the narrow local
// ENGINE_SWAP_RE to the full shared RESTOMOD_TAGS list (lib/modelRules.js restomodReason) - bare
// "<N>L-Powered", RUF, Turbo look, slant-nose CONVERSION (not bare slant-nose - Porsche's factory
// 930 Flachbau stays in the pool), bare "Modified"/"modded", widebody/body kit, bagged/air ride,
// lifted, stroker, built engine, twin-turbo conversion, custom built. setAsideReasonFor broadened so
// all of these read as "modified" (not the price-outlier "odd sale" bucket). Sam's Take's mileage/
// transmission/service/modifications clauses now say "higher-priced"/"lower-priced" explicitly
// instead of ambiguous "higher half"/"lower half"; the known_flaws "reported issue" comparison is
// REMOVED (sampled live first - the field is a clean OCD-provided array, but its item count conflates
// seller itemization style with actual condition, no solid basis for comparing two sellers' counts).
// quarterlyBandsFor/yearOverYearDirectionFor now read a locally fenced copy of recent/prior (same
// provenance/engine-swap/halo exclusions as the headline), so the over-time trend bars and the
// headline range can never show a modified/ex-celebrity/halo car for the other's window while
// excluding it from its own. A cached row for any of this predates all of it and must be refused.
// 2026-10-12 (trim fence fix): titleExclude (survives famSpec) + Camaro SS/Z11/Pace Car/COPO/Yenko
// added to PERF_TRIMS and HALO_PATTERNS. A cached row for any base-query pool these halo words could
// leak into (Camaro, Corvette, Mustang, M-cars, AMG) was computed before this fix and must be
// refused - confirmed live, a stale cached "1969 Ford Mustang Convertible" row kept serving its
// pre-fix count after this commit deployed, until this bump forced a fresh recompute.
// 2026-10-12 (context-cards job): pickRepresentative now prefers the searched year +/-1 (clamped to
// a curated half-generation or generation boundary) for the three context cards, falling back to the
// full pool and tagging each off-window card (new `offWindow` field, same mechanism as sameHalf) when
// fewer than 3 comps fit. The range/count/set-aside numbers are unchanged - only card selection. A
// cached row's `representative` block predates this and must be refused.
// 2026-10-13 (trim-fence sweep, jobs 1-11): (a) GLUED-SUFFIX fix (codeGluedSrc) - GT350/GT500/Z06/
// ZR1/ZL1/Z28 baseExclude and HALO_PATTERNS no longer miss a glued sub-variant suffix (GT350R,
// GT350CR, GT500KR); (b) BMW baseExclude now matches the standalone M-badge token (M2-M8), not the
// literal (and never-occurring) phrase "<series> M" - a bare "3 Series" search can no longer pool an
// M3; (c) a bare 911/SUBTRIM_FENCES nameplate with NO trim now defaults to the group's BASE trims
// only (Carrera/Carrera S), keeping ANY unrecognized row out (an unmatched title used to silently
// stay) - fixes a numbered special edition ("911 Spirit 70") riding into a base Cabriolet pool; (d) a
// MAKE-LEVEL HALO set-aside (recordExcludeReason) now runs on every dense pool with no SUBTRIM_FENCES
// entry of its own (BMW M-cars and others), catching CSL/GTR/Sport Evolution specials that previously
// had zero fence at all; (e) the trim QUESTION's option counts are now read from the SAME today-first,
// universal-fenced window the headline itself uses (poolN field added) instead of the raw multi-year
// pool, so options can no longer sum to far more than the headline count; (f) quarterlyBandsFor/
// yearOverYearDirectionFor now share r._tag with the headline (recentFenced/priorFenced filter on
// r._tag alone) instead of re-deriving a narrower three-reason fence and a SECOND r4Split price cut
// for a covered model, so the over-time block's row counts always sum to the headline count; (g)
// pickRepresentative's "middle of the range" card is now constrained to a sale INSIDE the headline
// band, nearest its midpoint (preferring one with pool sales on both sides of it by mileage), and
// returns no middle card when nothing qualifies, instead of a raw pool-median pick that could land
// outside the displayed range; new lowestSale/highestSale/belowRangeCount/aboveRangeCount/
// belowRangeSales/aboveRangeSales fields; (h) titleFenceReason extracted from qualifyReason so the
// live "comparable right now" panel (lib/live/search.js liveForFamily) can apply the IDENTICAL trim/
// model-line/modified/replica/conversion/body fence a sold comp needs, plus the same buildSpec year
// window (no more live Turbo S/non-M3/conversion cars shown as "live right now" next to a fenced sales
// pool); (i) BODY_STYLE_WORDS (lib/vehicle.js) gained "sedan"/"wagon" - a typed body word no longer
// silently drops to null; (j) humanTitle strips any seller text before a title's first year and any
// leading/trailing punctuation. A cached row predates every one of these and must be refused.
// 2026-10-13 (pool-consistency root cause job): (a) buildPool extracted from buildResult as the ONE
// pure pool computation (trim-default-scoping, today-first window, provenance/engine-swap/halo set-
// aside) - the gearbox/competition QUESTION (runOneBox, called before buildResult) now calls it too,
// so a split can never again read a wider pool than the headline (confirmed live: M3 Coupe headline
// 87 vs gearbox split 131+16=147 before this fix); inlineSplits gained poolN/unknown fields so sides
// + unknown always sum to exactly the headline count. (b) Sam's Take mileage wording fixed ("typically
// around" replaces "averaged" - the figure is a median) and ST_BANNED widened to catch this class of
// word server-side, not just via the client-side copy lint after the fact. (c) The over-time block
// (tradingPeriodsFor, replaces quarterlyBandsFor) now buckets the EXACT headline window (windowStart
// to now) into four trailing three-month periods by day count, not calendar quarters - calendar
// buckets left a real slice of the window (e.g. Oct-Dec of the prior year) in no bucket at all, so
// rows never summed to the headline count. A period below RANGE_THRESHOLD is omitted entirely (no
// thin flag); its rows fold into the new rowsNotShownCount field so the arithmetic is never hidden.
// A cached row predates all of this and must be refused.
// e18 (Lane B job, Oct 2026, Part 1/3 cache-bust): f4640ea ("model-first ladder replacing the
// make-era fallback") added the exact-model-year pre-check (yearRungExact) ahead of the existing
// +/-2/generation window fetch, a real change in WHAT gets fetched and returned for a trim-named or
// bare-year query, but never bumped this constant - every spec_market_cache row computed before that
// change kept passing the engineVersion gate (lib/live/search.js prefetchSpecs/specCore) and was
// served to Buy/Tasks as "fresh" indefinitely, while Market Check (always a live runOneBox call) and
// Sell (fetchOnlinePool reading runOneBox's own rawPool) got the corrected answer immediately -
// confirmed live via scripts/crossProductCheck.js: 2016 Ford Mustang Shelby GT350, 2005 BMW M3 Coupe
// and 2009 Porsche 997 Carrera S Coupe all showed Buy/Tasks landing one model year off Market Check/
// Sell (count and low/high genuinely different pools, not a rounding gap). Bumping here forces every
// pre-fix row to miss and recompute under the real, current ladder.
// e19 (Lane B job, Oct 2026, Part 1 range-first stop rule): the exact-model-year pre-check used to
// COMMIT the moment the car's own year cleared THIN(3), never trying the wider year_widened/generation
// window even when it would have found a real RANGE_THRESHOLD(8)+ cohort - confirmed live, a bare
// "2025 Porsche 911" answered from 3 sales instead of the 29-sale 2024-2026 pool it used to show. Now
// gated on RANGE_THRESHOLD, with a solid-count rescue so neither rung's sales are silently dropped
// when both fall short. A real WHAT-gets-computed change; bumps again so no pre-fix cached row survives.
// e20 (Lane B job, Oct 2026, Part 2 label truthfulness): three label-only bugs fixed - (a) a widened
// thin-tier pool (36mo, assessThin) labeled only the single asked year even when its own rows span
// more ("2005 Mercedes-Benz CLK DTM" read "2005" over a pool that actually spans 2003-2007); (c) a
// stated body style ("Cabriolet") was dropped from the label whenever it widened past the exact rung,
// since `nameplate` never carried it ("2025 Porsche 911 Cabriolet" labeled "911 models, 2020 to
// 2026" with no mention of Cabriolet); (b) a query naming no body got no notice when its own pool held
// more than one. Label text only - no fetch/fence/threshold changed - but bumped anyway since a stale
// cached label is still a wrong label a seller reads.
// e21 (Lane B job, Oct 2026, Part 2 follow-up): Defender 90/110/130 is a variant dimension the
// resolver has no field for at all (vehicle.trim stays null for "Defender 110") - a stated door-count
// was silently pooling every wheelbase together; buildSpec now reads it straight off searchText (the
// same local-scan pattern wantTurbo already uses) and sets it as spec.trim, so the existing trim ladder
// scopes to it for free. Also fixed bodyMixSuffix double-counting one real open-top family as two
// styles ("Cabriolets, convertibles and coupes" for a genuine coupe+cabriolet CLK DTM pool) by grouping
// on bodyFamily, and lower-cased LABEL_BODY_PLURAL for consistent casing. Bumped because the Defender
// change is a real fetch-scope change, not just label text.
// e22 (Lane B job, Oct 2026, Part 4): the year_widened rung now widens one year each side at a time,
// checking RANGE_THRESHOLD after every step and bounded by the generation, instead of jumping straight
// from the exact year to the full generation/calendar bound - a bare "2025 Porsche 911" used to answer
// from the full 992 window (2020 to 2026, 42 sales) the instant 2025 alone was thin, skipping the
// ~29-sale 2024-to-2026 band one step out that already clears RANGE_THRESHOLD. The year_widened label
// now states the pool's REAL achieved span (poolYearSpan on the final rows), never spec.yearMin/
// yearMax directly, since the widen can now stop well short of that ceiling.
// e23 (Lane B job, Oct 2026, Part 5/6): label order is now deterministic (body-mix: most-sold body
// first, then descending count; Defender doors: ascending number, never a plain string sort, which
// read "110, 130 and 90"). Cards now carry vinNorm and hasHistoryPage (the VIN page index rule,
// result-tier cards). rawTitleSearch and the __specEngine.outcomeUsd entry are removed (dead code,
// B2's note). Real output changes; bumps so no pre-fix cached label/card survives.
// e24 (Lane B job, Oct 2026, URGENT Part 4 perf fix): widenYearByYear re-queried the archive once PER
// widen step - a real production regression (Lane C measured 1969 Chevrolet Camaro at 20-23s and 1995
// Porsche 911 Carrera at 14-19s against an 18s budget, one "catching his breath"). Fixed to fetch the
// full generation/calendar bound ONCE and slice by year in memory for every step - same output, one
// query. Bumped so no slow/stale cached answer from the broken version survives.
// e25 (Lane B job, Oct 2026, URGENT Part 4 perf fix, part 2): e24 removed the per-step re-fetch but
// left a SECOND, separate full redundancy - the exact-year pre-check and the widen-to-full-bound
// step were still two separate fetches, the second always a strict superset of the first. Still over
// budget live (1995 Porsche 911 Carrera 14,661ms vs 14,000ms; 1969 Chevrolet Camaro 20,443-23,637ms
// vs 8,000/18,000ms, measured post-e24). Merged into walkYears: ONE fetch at the full bound (or one
// exact-year-only fetch when nothing is narrower than the ceiling), every span from the exact year
// through the full bound sliced from it in memory. No separate exact-year query anymore at all.
// e26 (Lane B job, Oct 2026, URGENT Part 4 REVERT): e25 was STILL over budget live across three full
// five-run rounds (1995 Porsche 911 Carrera 19.3-20.6s vs 14s; 1969 Chevrolet Camaro 19.2-22.7s vs
// 18s/8s) - the cost was never query COUNT (already one by e25) but that the widen fetch's year-bound
// (the whole curated generation) pulls meaningfully more rows than the single-year check it replaced,
// and a miss still falls through to the SAME old fallback fetch anyway. Reverted the one-year-at-a-
// time widening entirely (walkYears removed, both arms back to the pre-Part-4 single exact-year
// check) to restore the measured-safe baseline. The behavioral improvement itself ("2025 Porsche 911
// stops at 2024-2026, not 2020-2026") is NOT in this build pending a provably cheap re-implementation.
// e27 (Lane B job, Oct 2026, Part 3 golden-cars job): walkYears (one-year-at-a-time year_widened,
// one-fetch/slice-in-memory) RE-RESTORED - the e26 revert's actual cost (the first live compute of a
// wide-generation spec) is now absorbed by Part 1's write-through warm cache + scripts/
// postDeployWarm.mjs (run once after this reaches production, before the speed check), so the widen
// behavior itself never needed to get cheaper. Also real pool/label changes this version: a
// model-any-year upgrade when the widened years still land under RANGE_THRESHOLD but the model's
// whole run reaches it (2011 Honda S2000); Defender 90/110/130 now reads vehicle.wheelbase (a real
// resolver field) before falling back to raw search text, so Buy/Sell/Tasks/ops scope it the same as
// Market Check's page path; trimTitleRe excludes GTB/4 from a bare "GTB" trim match (two distinct
// models sharing a substring). Bumped so no pre-fix cached pool/label survives.
// e28 (Lane B job, Oct 2026, Part 4 golden-cars job): cards now carry structured make/model columns
// (shapeCards), fetchQualifying's select gained make,model, and oneEngineAnswer runs the five output
// checks (runOutputInvariants, moved from scripts/crossProductCheck.js, ONE implementation) on every
// result/thin answer - a failure downgrades to a refusal/not_enough_data rather than ever serving an
// answer that failed its own internal consistency check. Bumped: a pre-fix cached card has no make/
// model fields, and a pre-fix answer was never run through the gate at all.
// e29 (Lane B job, Oct 2026, URGENT fix): e28's output-invariant gate (check i) compared a card's
// structured model column literally against the typed model, with no allowance for the chassis-code
// alias OldCarsData genuinely uses for some generations (a 2024 Porsche 911 can carry model:"992",
// not "911" - CLAUDE.md "OCD chassis-code models"). Confirmed live via task=obdiag&gate=1: a real
// 2025 Porsche 911 pool flagged 9 of 12 cards as a wrong car ("Porsche 992") and the gate downgraded
// a correct 12-sale result to not_enough_data on the Buy/Tasks/Sell lanes (goldenTruth caught it
// within the hour). Fixed: the resolved car's own genCode is now accepted as an equally valid model
// token. Bumped so no e28-computed, wrongly-downgraded cached answer survives.
// e30 (Lane B job, Oct 2026, Part 5/6 new Market Check design fields, corrected same day by Sam):
// result and thin tiers now carry scopeLabel, liveScope, contextRoles, identityQuestion, trend
// (quarters + priorYear), distribution and strip - all computed from the SAME pool as the answer,
// never a second query. heroReceipt was explicitly dropped per Sam's correction. Bumped: additive
// fields only (no existing field changed shape), but a pre-fix cached answer simply lacks them.
// e31 (Lane B job, Oct 13 2026, Jobs 1, 2, 4, 5): the output gate's check (i) read OldCarsData's alias-
// ridden model column as a key ("Grand National - Regal", "CLK AMG", "3-Series" for an M3) and refused
// correct 55-, 35- and 14-sale answers; it now matches the column OR the card's own title, accepts a shared
// stem and the chassis code, and fails only on a swapped pool (strays at least half the cards). Check (ii)
// accepts a trim token the label itself names. A one-letter trim ("911 R") no longer pre-filters the
// database as ilike *R* (the whole marque). The replica fence catches "RE-CREATION" / "Re Creation".
// ownSales added for a VIN or chassis search. Bumped: every e28-e30 cached refusal of a correct answer must
// miss, and a pre-fix pool can hold hyphenated replicas.
// e32 (Lane B, Oct 13 2026, Job 2 third cost): a named trim on a generation-mapped nameplate no longer
// takes the trim-dropped model-any-year rescue (it read every 911 of every generation over five years,
// 90 to 130 seconds measured, only to be refused); it goes straight to the named sibling. A thin named
// trim's answer is its own sales. Bumped: a cached answer for such a query could carry the old rescue.
// e33 (Lane B, Oct 14 2026): e32's skip tested spec.genBound, which the 2016 911 R's 991.1 spec did not
// carry despite its year bound; the per-fetch trace showed the two unbounded 15,375-row rescue fetches
// still running (117 of 121 seconds). The skip now tests the year bound itself, and the rescue runs once
// per answer (memoized) instead of once from the upgrade check and once after the refusal.
// e34 (Lane B, Oct 14 2026, four Market Check fields): distribution buckets carry share (whole percents
// summing to 100); trend is always the last four calendar quarters with thin: true under eight sales;
// every tier carries windowMonths / windowStart / windowWords; rawPool rows carry has_reserve.
// e35 (Lane B, Oct 14 2026, three golden fixes): the rung and label describe the pool's own years (the
// generation rung only when the receipts span the generation, else year_widened with the real span, plus
// output check vi label_span_within_receipts); the One Box thin gate reads the written five-year window
// (OB_THIN_WINDOW_DAYS); a typed year/make/model is never mistaken for a VIN (lib/vehicle.js).
// e36 (Lane B, Oct 14 2026, Lane C's find): a nameplate query and its chassis-code form read the same
// pool (fetchQualifying chassis-code union, chassisAltModels).
// e37 (Lane B, Oct 14 2026): output check (i) accepts the chassis-code union's other spelling (a "997"
// query's rows filed under "911"), which e36's gate had read as a swapped pool and downgraded.
// e38 (Lane B, Oct 14 2026, from the e37 sweep): the thin label follows the same years-of-the-pool rule as the
// result label (genYears carried); the model-any-year rescue skip applies only to a nameplate with three or
// more curated generations, so a 275 GTB/4 NART Spider reads "275, all years" again instead of not_tracked.
// e39 (Lane B, Oct 15 2026, Sam's four jobs): body from the title first and a stored body only when the
// model's own facts offer it (Job 1); United States and Canada only, one inMarket rule on every pool build,
// country stamped on every row (Job 2); the 275 GTB/C fenced like the GTB/4 (Job 3); variant markets, the
// "Which {car}?" question or a named set-aside (Job 4).
// e40 (Lane B, Oct 15 2026, from the span scan of Job 4c): the scope line always names the base variant when a
// nameplate has a variant market; the thin path sets variants aside too; the 1973 Carrera RS Lightweight entry;
// a title model year outside the bound beats a wrong year column; a trim named "-style" with an en or em dash
// is fenced; a blend nameplate never takes the model-any-year rescue.
// e41 (Lane B, Oct 15 2026, Sam's five jobs): body options count the page they open and offer every body present
// (fastback its own body before 1990); the body refine narrows the finished pool; the applied body or trim comes
// back on resolvedCar and in the label; a failed archive read is read_failed, never not_tracked; the scope line's
// body words come from titles only; the live search never lets a generation code stand in for the model word.
// e42 (Lane B, Oct 15 2026, from the e41 proof): body options and the body refine read title words only, never the
// stored body_style field (the 2006 M5 had offered a Convertible option from stored fields).
// e43 (Lane B, Oct 15 2026, from the e42 identity-count proof): a body or trim chip never widens the page it opens
// (the walk and the rescues test the bare pool); the applied choice sits on resolvedCar for refused pages too.
// e44 (Lane B, Oct 15 2026, from the e43 identity-count proof): the model-any-year and sibling rescues never run on
// a page a body or trim chip opened; it shows its own rows, thin when thin.
// e45 (Lane B, Oct 15 2026, Sam's item 7): every live count (Buy, the Task preview, Market Check's panel) reads the
// typed year through the years the sales read landed on (lib/live/search.js liveYearWindow).
// e46 (Lane B, Oct 15 2026, from the e45 live-count proof): with no sales read to lean on the live window is the typed
// year itself (Buy's own rule), the parse's single typed year takes the shared window, and the panel honours the
// resolved car's generation code.
// e47 (Lane B, Oct 15 2026, Sam's items 9 to 12): restoration is a set-aside reason by the variant-market rule, never a
// question; every set-aside row returns with its reason words (setAsideRows, qualifyingTotal, check viii); the identity
// line offers both sides of every variant market even at zero, and a variant chip walks the years inside the
// generation or says nothing on record.
// e48 (Lane B, Oct 15 2026): a variant chip narrows a thin (house) pool to its side too, and the chip's nothing-on-record
// answer carries the run's diag.
// e49 (Lane B, Oct 15 2026, Sam's items 13 and 14): the applied refine (body, trim, variant) is in every cache key an
// answer is stored under (lib/live/search.js specKeyFor, the Market Check warm row, the write-through, the Sell facts
// row); postDeployWarm warms every car live on Buy first (task=warmLive).
// e50 (Lane B, Oct 15 2026, Lane C's two finds): a special edition set aside by the model rule reads "limited edition";
// every card carries platformName (the venue's display name for every source).
// e51 (Lane B, Oct 15 2026, Lane A's find): a variant-market chip reaches the engine (the API sanitizer kept only
// competition/standard), so a zero-count option returns its nothing-on-record answer on both tiers, never the base page.
// e52 (Lane B, Oct 15 2026): a stale restoration/unrestored refine is ignored (never an option), and the thin tier's
// empty option line is null like the result tier's.
// e53 (Lane B, Oct 15 2026, Sam's table run): every engine body word is accepted as a chip (fastback was not), and the
// sales whose titles name no body are their own option ("Body not stated"), so options equal their pages and sum to Any.
// e54 (Lane B, Oct 15 2026, urgent): the output gate no longer double-counts the unspecified rows once "Body not stated"
// is an option (e53 had turned every bare page with such rows into a cardless refusal on the public path).
// e55 (Lane B, Oct 15 2026, Sam's option 2 + poolYears): one body classifier, title words only, for typed body words,
// options and chips alike (no stored field, no default body); poolYears on every rung from the pool the answer used.
// e56 (Lane B, Oct 16 2026): deterministic archive pages (sale_date then id: a page-boundary row can no longer be
// dropped or doubled), one archive read per query per request, the stale recompute self-call on the alias with a
// live-compute fallback after 90 s.
// e57 (Lane B, Oct 16 2026): a trim that is exactly a body word is the body chip; the stale recompute's self-call is
// sent before the response leaves (its connection awaited, bounded).
// e58 (Lane B, Oct 16 2026): a body chip and a typed body read a row's body the way the typed path always did (title word,
// else the model's own body names, compared by family: the Boxster's rows are roadsters, so "convertible" finds them); a
// body with no sale in the car's pool answers in words, never a cardless refusal; readAt and trend quarters on every
// answer; the stale recompute runs in-process under waitUntil; an emptied refine is no refine.
// e59 (Lane B, Oct 16 2026): the whole-pool body rule reads the bare pool's qualifying rows; a body whose rows were all
// set aside says so; Gullwing is a coupe word; a base-trim scope that would empty the pool is no scope (bare 1964 to 1973
// 911s read again); resolver: 911 SC keeps SC, a pre-1973 Mercedes SE badge is its own model with its displacement as the
// trim, BMW engine-badge decimals (2.5i, 3.0si) survive, Renault Alpine is a nameplate; a failed spec_market_cache read
// no longer marks a Buy batch as missing (Lane E).
// e60 (Lane B, Oct 2026, the last engine bump before launch unless a golden failure forces another): the year-less
// pre-1973 badge rule; a pure-decimal trim never pre-filters titles; Black Series explicit; numeric count siblings;
// latestSaleDate / oldestIncludedSaleDate; readAt on every tier; the resolver timing contract (a lookup timeout is a
// "still reading" answer, never a different car; no cooldown) and the taxonomy refreshed off the request path; the
// body-style words exported for the Buy card; task=projdry. Warm: traffic, golden and demo cars only.
export const ENGINE_VERSION = "e67-20261019-raretrims";

const DAY = 864e5;
const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalize = v => String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Model-chip family key (WS1.3): collapse same-family duplicate model names the archive
// carries ("430" and "F430"; "MX-5" and "MX5 Miata"; "3-Series" and "3 Series") to ONE
// chip. Strip separators, drop a Ferrari F-prefix on a number, drop a redundant trailing
// nameplate nickname, so same-family variants share a key and merge.
function chipFamilyKey(name) {
  let k = String(name || "").toLowerCase().replace(/[\s-]+/g, "");
  k = k.replace(/^f(\d)/, "$1");     // Ferrari F-number: f430 -> 430
  k = k.replace(/miata$/, "");        // MX5 Miata -> MX5
  return k;
}
// Pick the canonical display name for a merged family: prefer the Ferrari F-form (F430
// over 430), else the cleanest short name (MX-5 over MX5 Miata).
function pickChipDisplay(names) {
  const ferrari = names.find(n => /^f\d/i.test(n));
  if (ferrari) return ferrari;
  const clean = names.filter(n => !/miata$/i.test(String(n).replace(/\s+/g, "")));
  const pool = clean.length ? clean : names;
  return pool.slice().sort((a, b) => String(a).length - String(b).length || a.localeCompare(b))[0];
}
function mergeModelChips(counts) {
  const groups = new Map(); // familyKey -> { names: Map(name->count), total }
  for (const [name, count] of counts) {
    const key = chipFamilyKey(name);
    if (!groups.has(key)) groups.set(key, { names: new Map(), total: 0 });
    const g = groups.get(key); g.names.set(name, (g.names.get(name) || 0) + count); g.total += count;
  }
  return [...groups.values()].map(g => [pickChipDisplay([...g.names.keys()]), g.total]);
}

// Curated distinct-market performance trims (Aug 2026). When a seller names one,
// the comp pool is scoped TO it (title match) instead of pooling the whole model and
// letting the outlier guard discard the real comps. Cosmetic packages ("M Sport",
// "AMG Line") are explicitly excluded so they never read as the performance car.
const COSMETIC_TRIM = /m[\s-]?sport|m[\s-]?package|m[\s-]?pkg|m[\s-]?performance|amg[\s-]?line|s[\s-]?line|r[\s-]?line|sport\s?line|shadow\s?line/i;
// Each make: activate (does the seller's trim name the performance car), include
// (title matcher to scope the pool TO it), and baseExclude (title matcher to drop the
// halo from a BASE query so it never pools in). baseExclude is null when the model IS
// the M-car (a base "M3" keeps its Competition; only "X5 M" is dropped from base X5).
// PERF_TRIMS include/baseExclude note (Oct 2026, platformPick.js 40-car audit, Bucket B): Porsche/
// Chevrolet/Ford's `include` used to build a literal `\btrim\b` (or space-only `escRe(tr).replace(
// /\s+/g,"\\s*")`) regex instead of the shared separator-flexible trimTitleRe/trimCodePattern this
// file already uses elsewhere for exactly this problem - so a title spelled with a slash or hyphen
// ("Camaro Z/28", "Corvette ZR-1") never matched, qualifyReason returned "different variant (trim
// scope)" for every real row, and the pool read almost empty even though the sales exist. Switched
// to trimTitleRe(tr) (same regex Market Check's main trim ladder, Buy and Sell's fetchQualifying
// calls all already share) so every caller of buildSpec gains this fix identically - one engine
// rule, not a platformPick.js-only patch. Chevrolet's baseExclude (keeps a halo OUT of the plain-
// model base pool) and Ford's (same) had the identical literal-match gap on the digit codes, fixed
// the same way; the plain words (shelby/boss/svt) were never affected.
// Title matcher for a NAMED trim (scope the pool to it). Tokens must appear contiguous with
// word boundaries so "Carrera S" never matches "Carrera 4S" and "GT3" never matches "GT3 RS"
// unless the query WAS "GT3 RS". Digits stay literal ("Z06", "GT500").
// HYPHEN/SPACE-NEUTRAL TRIM CODES (Oct 2026): a trim code reads the same whether a title writes it
// "ZR1", "ZR-1" or "ZR 1" ("Z28"/"Z-28"/"Z/28", "SS396"/"SS 396", "GT350"/"GT-350", "XJS"/"XJ-S"). A
// separator is optional only where letters meet digits inside a code (and between a letter word and a
// digit word), plus the curated letter codes below; ordinary words still need a separator. XJR-S, XJ220,
// E-Type, F-Type and Rolls-Royce never merge: no rule joins across extra letters or digits.
const LETTER_CODE_SPLITS = { xjs: ["xj", "s"], xke: ["xk", "e"] };
function codeRuns(word) {
  const w = String(word || "").toLowerCase();
  if (LETTER_CODE_SPLITS[w]) return LETTER_CODE_SPLITS[w];
  return w.match(/[a-z]+|\d+|[^a-z\d]+/g) || [];
}
const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function trimCodePattern(trim) {
  const words = String(trim || "").trim().split(/[\s/-]+/).filter(Boolean);
  if (!words.length) return null;
  let out = "";
  words.forEach((w, i) => {
    if (i) { const prev = words[i - 1]; out += (/^[a-z]+$/i.test(prev) && /^\d/.test(w)) || (/\d$/.test(prev) && /^[a-z]/i.test(w)) ? "[\\s/-]*" : "[\\s/-]+"; }
    out += codeRuns(w).map(reEsc).join("[\\s/-]*");
  });
  return out;
}
function trimTitleRe(trim) {
  const pat = trimCodePattern(trim);
  if (!pat) return null;
  // GTB vs GTB/4 (Lane B job, Oct 2026, Part 3 golden-cars job): a 275/365 GTB (two-cam) and its
  // GTB/4 (four-cam, Daytona-spec) are DIFFERENT models - docs/golden-rules.md section 2, "a model
  // with its own name is its own pool... the same applies to any suffix that names a different car
  // (GTB/4, GTS, GTC)". The plain boundary match below treats "/" as a non-word character, so a bare
  // "GTB" trim query's title match ALSO matched every "GTB/4" title (confirmed live: the 1966
  // Ferrari 275 GTB pool held 19 rows, nine of them 1967 GTB/4s). A negative lookahead excludes only
  // the literal four-cam suffix - GTB/6C, GTB Alloy, GTB Competizione and every other real GTB
  // sub-type still match normally, and a query that itself names "GTB/4" is untouched (its own trim
  // string is "GTB/4", not "GTB", so this guard never activates for it).
  // GTB/C (Oct 15 2026, Sam's Job 3a): the competizione is a different car by the same rule as the GTB/4
  // (a 1966 275 GTB/C sold for $7,595,000 in a two-cam pool whose next sale was $3,481,000).
  const noFourCam = /^gtb$/i.test(String(trim || "").trim()) ? `(?!\\s*\\/?\\s*(4|c)\\b)` : "";
  // e59: a letters-only trim of one to three letters may be glued to a numeric model in the title ("1979 Porsche
  // 911SC Targa", "911S", "911T"); its left boundary also accepts a digit. The right boundary is unchanged.
  const left = /^[a-z]{1,3}$/i.test(String(trim || "").trim()) ? "(^|[^a-z])" : "(^|[^a-z0-9])";
  return new RegExp(`${left}${pat}${noFourCam}([^a-z0-9]|$)`, "i");
}
// GLUED-SUFFIX SAFE boundary for a CODE trim used in an EXCLUDE/halo pattern (trim-fence sweep,
// Oct 2026). A named sub-variant can glue extra letters directly onto the code with no separator
// (GT350R, GT350CR, GT500KR, GT350H) - a plain trailing \b boundary never lands there (the code's
// last digit and the glued letter are both word characters, so no boundary exists between them),
// silently letting the whole class of glued sub-variants escape a fence built from the bare code.
// Confirmed live: "GT350CR" passed a Mustang base-exclude built as `\bgt350\b` meant to catch it.
// Returns a pattern STRING (not a compiled RegExp) so callers can embed it in a larger alternation,
// same calling convention as trimCodePattern: true left boundary, the code, then 0-3 trailing
// letters, then a true right boundary via lookahead (not \b, so the consumed trailing letters never
// block the boundary check the way a bare \b would).
function codeGluedSrc(codeSrc) {
  return `(?<![a-z0-9])${codeSrc}[a-z]{0,3}(?![a-z0-9])`;
}
// The DB pre-filter for a trim: one ILIKE with a `*` wildcard where a separator may sit ("ZR*1",
// "SS*396", "XJ*S"), so every spelling reaches the app; qualifyReason then keeps only real matches.
export function trimIlike(trim) {
  const words = String(trim || "").trim().split(/[\s/-]+/).filter(Boolean);
  return words.map(w => codeRuns(w).join("*")).join("*");
}

const PERF_TRIMS = [
  { make: /^bmw$/i, activate: /^m( competition)?$/i,
    include: (m) => new RegExp(`\\b${escRe(m)}\\s*m\\b|\\bm\\s*competition\\b`, "i"),
    // baseExclude FIXED (trim-fence sweep, Oct 2026): the old pattern looked for the literal phrase
    // "<series> M" (e.g. "3-Series M") immediately adjacent in the title - real titles say "BMW M3
    // Coupe", never "BMW 3-Series M Coupe", so the phrase never landed and an M3/M4/M5 filed under
    // the base series model slipped straight into a bare "3 Series" pool (confirmed live: a 2013 BMW
    // M3 Coupe Competition Package sat in a bare 2012 BMW 3 Series pool). Matches the STANDALONE
    // M-badge token instead (M2/M3/.../M8), the same shape performanceBadge itself uses to detect a
    // badge - so a bare series search excludes every M-car, not just the one matching its own number.
    baseExclude: (m) => /^m\d/i.test(m) ? null : /\bm[2345678]\b/i },
  { make: /porsche/i, activate: /gt3|gt2|turbo\s*s|\bgts\b|\bgt4\b/i,
    include: (m, tr) => trimTitleRe(tr) || new RegExp(escRe(tr).replace(/\s+/g, "\\s*"), "i"), baseExclude: () => null },
  // Camaro performance/special-edition trims added (trim-fence fix, Oct 2026, owner's call): SS
  // (and SS396/SS427-style, \bss\d*\b so "SS396" as one token still matches), Z11 and Pace Car/Indy
  // Pace Car editions, COPO, Yenko, Baldwin-Motion. RS ALONE is an appearance package, not a
  // performance trim, and deliberately does not activate - stays in the base pool. An "SS/RS" title
  // still activates (the "ss" token matches on its own). Shared across every Chevrolet model (make-
  // level, not Camaro-only) same as Z06/ZR1/ZL1/Z28 already were - none of these words collide with
  // a genuine Corvette or other Chevrolet trim name.
  { make: /chevrolet/i, activate: /z06|zr1|zl1|\bz\/?28\b|\bss\d*\b|\bz11\b|\bpace\s?car\b|\bcopo\b|\byenko\b|\bbaldwin[\s-]?motion\b/i,
    include: (m, tr) => trimTitleRe(tr) || new RegExp(`\\b${escRe(tr)}\\b`, "i"),
    // baseExclude: z06/zr1/zl1/z28 now glued-suffix safe (codeGluedSrc) - no known glued variant for
    // these today, but the SHAPE fix is applied uniformly per make so a future one (or a title quirk)
    // can't silently escape the way GT350CR did below. ss\d*/z11/pace car/copo/yenko/baldwin-motion
    // are plain words or already glue their own digits with no boundary requirement; unchanged.
    baseExclude: () => new RegExp(`${codeGluedSrc(trimCodePattern("z06"))}|${codeGluedSrc(trimCodePattern("zr1"))}|${codeGluedSrc(trimCodePattern("zl1"))}|${codeGluedSrc(trimCodePattern("z28"))}|\\bss\\d*\\b|\\bz11\\b|\\bpace\\s?car\\b|\\bcopo\\b|\\byenko\\b|\\bbaldwin[\\s-]?motion\\b`, "i") },
  { make: /ford/i, activate: /shelby|gt500|gt350|\bboss\b|svt|mach\s*1/i,
    include: (m, tr) => trimTitleRe(tr) || new RegExp(escRe(tr).replace(/\s+/g, "\\s*"), "i"),
    // baseExclude FIXED (trim-fence sweep, Oct 2026, job 2a): gt500/gt350 now use codeGluedSrc so a
    // glued sub-variant suffix (GT350R, GT350CR, GT500KR, GT350H) is caught - the old `\bgt350\b`
    // never landed its trailing boundary against a glued letter (both are word characters), so these
    // sub-variants silently escaped the base-Mustang exclude. A plain "GT350" query is unaffected
    // (its own include path is a separate, more specific trimTitleRe match, not this baseExclude).
    baseExclude: () => new RegExp(`shelby|${codeGluedSrc(trimCodePattern("gt500"))}|${codeGluedSrc(trimCodePattern("gt350"))}|\\bboss\\b|svt`, "i") },
  { make: /mercedes|benz/i, activate: /amg|\b\d?63\b|\b55\b|\b65\b|black series/i,
    include: () => /\bamg\b|\b63\b|\b65\b|\b55\b|black series/i, baseExclude: () => /\bamg\b|\b63\b|\b65\b|black series/i }
];

// The meaningful nameplate for labels: a Mercedes family head ("SL-Class") defers to
// its badge trim ("500SL"); otherwise model + trim ("X5 M", "911 Carrera").
function nameplate(model, trim) {
  model = model || ""; trim = trim || "";
  if (/-class$/i.test(model) && trim) return trim;
  if (trim && trim.toLowerCase() !== model.toLowerCase() && !model.toLowerCase().includes(trim.toLowerCase())) return `${model} ${trim}`.trim();
  return model || trim;
}

// How to search the archive: badged families (Mercedes -Class) lump every variant
// into one model field and even mislabel unrelated cars, but every listing carries
// the badge in its TITLE, so we search make+year and filter the badge title token.
// Everything else searches the model field directly.
// Performance-badge detection (Sep 2026). BMW M-cars, Mercedes-AMG and Audi RS are TITLED by
// the badge ("M4 Coupe Competition Package") but FILED under the base series ("4-Series",
// "F Series") - so scoping by the model field pools the base car (430i/440i) or finds nothing.
// Return the badge to scope on (in the TITLE) + a word-boundary matcher (so "M4" never catches
// "M440i") + the variant that further scopes the exact-trim rung (Competition / CS / GTS).
// Separator-flexible, word-boundary badge matcher: "S65" also matches "S 65"/"S-65" (the houses
// title AMG cars with a space, online titles them closed-up), "M3" matches "M 3". A general fix
// (item 1, Sep 2026): insert an optional [\s-] at every letter<->digit boundary of the code. Still
// word-boundary anchored, so "S65" never matches "SL65"/"CLS65" and "M3" never matches "M340i".
function badgeFlexRe(code) {
  const esc = String(code).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pat = esc.replace(/([A-Za-z])(\d)/g, "$1[\\s-]?$2").replace(/(\d)([A-Za-z])/g, "$1[\\s-]?$2");
  return new RegExp(`\\b${pat}\\b`, "i");
}
export function performanceBadge(make, model, trim, context) {
  const hay = ((model || "") + " " + (trim || "")).trim();
  // Fix (a) Sep 2026: the BADGE is detected from the resolved model/trim (never from stray title
  // text), but the VARIANT is captured from a WIDER string - the matched listing title / search
  // text - so a bare-decoded "M4" whose title says "Competition Package", or a "C63" whose title
  // says "Black Series", routes to the exact-trim rung instead of dropping to the family/base step.
  const vhay = (hay + " " + (context || "")).trim();
  if (/^bmw$/i.test(make)) {
    const m = hay.match(/\bM([2345678])\b/i);
    if (m) { const v = (vhay.match(/\b(Competition|CSL|CS|GTS|GT4)\b/i) || [])[1]; const b = "M" + m[1]; return { badge: b, re: badgeFlexRe(b), variant: v ? (v.toUpperCase() === "CS" || v.toUpperCase() === "CSL" || v.toUpperCase() === "GTS" || v.toUpperCase() === "GT4" ? v.toUpperCase() : "Competition") : null }; }
  }
  if (/mercedes|benz/i.test(make)) {
    // Detect the AMG badge from the FULL context (vhay = model + trim + raw search), not just the
    // resolved model/trim: a bare "S65" is forced to model "S-Class" by the seeded DB alias, so the
    // "65" only survives in the raw text. vhay recovers it -> badge S65 (Part 1 scenario 1).
    const m = vhay.match(/\b((?:AMG\s)?[A-Z]{1,3})[\s-]?(63|65|45|43|55)\b/i);
    if (m) {
      const b = (m[1].replace(/AMG\s*/i, "") + m[2]).toUpperCase();
      // The "S" variant (a C63 S) is detected from the TRIM only, badge + AMG stripped - NEVER from
      // the family in `hay`, or the "S" in "S-Class" false-matches and an S65 becomes trim "S".
      const trimClean = String(trim || "").replace(new RegExp(b, "ig"), "").replace(/\bAMG\b/ig, "").trim();
      const v = /black\s?series/i.test(vhay) ? "Black Series" : (/\bS\b/.test(trimClean) ? "S" : null);
      return { badge: b, re: badgeFlexRe(b), variant: v };
    }
    if (/\bAMG\s?GT\b/i.test(hay)) return { badge: "AMG GT", re: /\bAMG\s?GT\b/i, variant: (hay.match(/\b(63|43|53|R|Black Series)\b/i) || [])[1] || null };
  }
  if (/audi/i.test(make)) { const m = hay.match(/\bRS\s?(3|4|5|6|7|Q3|Q8|e-tron)\b/i); if (m) { const b = "RS" + m[1].replace(/\s/g, ""); return { badge: b, re: badgeFlexRe(b), variant: null }; } }
  return null;
}
// chassisAltModels (Sam, Oct 14 2026): the other model-column spellings of the same car. A nameplate
// with a chassis-code generation ("911" + 997 / 991.1 / 992) gives the code's model token; a model that
// IS a chassis code ("997", "991") gives the nameplate whose curated generations carry that code. Only
// codes lib/generations.js knows (generationModelToken), never a guess; empty for everything else.
export function chassisAltModels(spec) {
  const out = new Set();
  const m = String((spec && spec.model) || "").trim().toLowerCase(), mk = String((spec && spec.make) || "").trim().toLowerCase();
  if (!m || !mk) return [];
  // The code token is added only when the archive really files cars under it as a model: a curated model
  // of that name (997, 991) or a pure three-digit Porsche-style code (992, 964, 993, 996); a letter-prefixed
  // code (E46, W124, C2) is never an archive model name and would only widen the fetch.
  const curatedModel = t => CURATED_GENERATIONS.some(g => g.make.toLowerCase() === mk && g.model.toLowerCase() === t.toLowerCase());
  if (spec.genCode) { const t = generationModelToken({ code: spec.genCode }); if (t && t.toLowerCase() !== m && (curatedModel(t) || /^\d{3}$/.test(t))) out.add(t); }
  for (const g of CURATED_GENERATIONS) {
    if (g.make.toLowerCase() !== mk) continue;
    const t = generationModelToken(g);
    if (t && t.toLowerCase() === m && g.model.toLowerCase() !== m) out.add(g.model);
  }
  return [...out];
}

export function archiveScope(spec) {
  if (spec.badge) return { byTitle: spec.badge };
  // Chevrolet Blazer family (K5 / S-10 / crossover): fetch ALL "Blazer" titles broadly, then let
  // qualifyReason keep only the matching kind (the 2nd-gen S-10 and some full-size are titled just
  // "Blazer", so a narrow per-kind fetch would run thin).
  if (spec.blazerKind) return { byModel: "Blazer" };
  // Variants OCD files under the PARENT nameplate's model column but names only in the TITLE: the
  // Ferrari 550/575 Barchetta sits under the "Maranello" model, so a model-column fetch for "550
  // Barchetta" finds nothing (51 real Barchetta sales exist, title-only). Scope by title instead.
  if (/^(550|575)\s*barchetta$/i.test(String(spec.model || "").trim())) return { byTitle: String(spec.model).trim() };
  if (familyFor(spec.make, spec.model) && spec.trim) return { byTitle: spec.trim };
  // BARE FAMILY-HEAD query, no trim (URGENT, Oct 2026, SL-Class class-era leak): "SL-Class" /
  // "S-Class" / "E-Class" etc. are never how the archive titles these cars (modelFamilies.js:
  // keyword "SL-Class" returns 74 vs "SL500" alone 2145), so falling through to the generic
  // byModel ILIKE below returns near-zero rows once the year window narrows, and the ladder
  // reads the model rung as empty and drops straight to class-era. Scope by MAKE instead (no
  // model/title string the archive doesn't carry) and let fetchQualifying's familyBadgeMatch
  // in-code filter do the real narrowing against the family's badgeRe (SL550/SL63/...).
  if (familyFor(spec.make, spec.model)) return { byFamily: true };
  // Scope the model ILIKE by the FAMILY, not a chassis-prefixed field value: the archive stores
  // an E30 M3 as "E30 M3", "M3", "M3 Sport Evolution" etc., so "*E30 M3*" catches only the
  // literal ones (1 of 52). Strip a leading chassis-code token (letter + 2-3 digits + space, e.g.
  // "E30 ", "W124 ") so it queries "*M3*"; the generation/year range keeps it E30-specific. Real
  // models never match (M3/X5/A6 are 1 digit; 993/997 are pure digits; badged makes go byTitle).
  var byModel = String(spec.model || "").replace(/^[A-Za-z]\d{2,3}\s+/, "").trim() || spec.model;
  return { byModel: byModel };
}

// SUBSTANTIAL modifications that move a car to a different market. BaT lists EVERY
// aftermarket item in `modifications` (radar detector, stereo, wheels), so rejecting
// any non-empty list wrongly excludes nearly every older car; only these matter.
// e65 (Sam, the modified set-aside fix): the seller's MODIFICATIONS text sets a car aside only for an ENGINE or BODY
// change (a swap, a widebody or body kit, a backdate, a restomod, a stroker, a different engine, a race build). Two
// classes no longer remove a stock car: forced-induction words on a car that is factory turbocharged or supercharged
// (a 993 Turbo's own turbochargers), and suspension words (lowering, coilovers, air ride, a lift), which are a note.
// "rebuilt engine" is maintenance, not a modification, and is gone. Title markers (Singer, RUF, RWB, restomod,
// widebody, swap, custom, ...) still set a car aside whatever the modifications text says.
const SUBSTANTIAL_MOD = /engine swap|motor swap|\bswap(ped)?\b|widebody|wide-body|body\s?kit|backdat|restomod|resto-mod|stroker|\bls[0-9]\b|big block|different engine|\bcammed\b|standalone ecu|roll cage|race prep/i;
// THE MODIFIED RULE (e65, Sam, Oct 19 2026; approved after his spot check). A sale is set aside as modified only when the
// listing DESCRIBES A CHANGE to the engine, the forced induction or the body, or the car is a known outlaw build. Words that
// only NAME what the car has (turbo, twin-turbo, supercharged, Kompressor, Tdi, intercooled, V8, a factory option) never set it
// aside alone. A rebuild of the car's own engine in stock specification is maintenance and never sets it aside; a rebuild to a
// different specification (stroker, built engine, forged internals, larger displacement) does. A light software tune or a
// bolt-on (exhaust, intake, wheels, suspension, brakes, stereo, cosmetics) never does; a stage-numbered tune, a big or custom
// tune with added boost or a bigger turbo, a built engine, an engine swap, a conversion kit or a widebody conversion does.
// Three signals (any one sets the sale aside):
//  (1) change language and an engine, forced-induction or body part in the same clause of the modifications text;
//  (2) an engine or induction descriptor IN FRONT OF THE YEAR in the title ("LS3-Powered 1996 ...", "Turbocharged 1990 ...");
//  (3) a builder or outlaw mark anywhere in the title (MOD_MARKERS: Singer, RUF, RWB, widebody, prerunner, ...).
// PREVALENCE GUARD (no hand list of factory-turbo cars): an engine or induction word carried by half or more of the fetched
// pool's titles is a feature of that model (turbo on 911 Turbos, Tdi on Defenders, supercharged on SVT Cobras), so it never
// triggers signal (1) or (2) for that pool. The standalone triggers below (stage tune, bigger turbo, stroker, swap, ...) ignore it.
const MOD_STANDALONE = /\bgtx?\d{4}[a-z]{0,2}\s+turbo|\bpower\s+(pack|upgrade\s+package)\b|\b(turbo|turbocharger|supercharger|blower)\s+kit\b|\b(kenne\s?bell|whipple|vortech|procharger|paxton|magnuson|e-force|roush\s+supercharger|hellion|on\s?3|heffner|hennessey)\b|\b(engine|motor|turbo\w*|supercharger|blower|body)\b[^,;\n]*\breplacing\s+the\s+(factory|original|stock)\b|\breplacing\s+the\s+(factory|original|stock)\s+(\w+\s+){0,2}(engine|motor|turbo\w*|supercharger|blower|body)\b|\brebuilt\b[^,;.\n]*\bto\s+[\d,.]+\s?(cc|ci|cid|l|liters?|litres?)\b|\bbody\s+widened\b|\bwidened\s+(body|fenders|\d)|\b(smaller|upgraded|overdrive|reduced|ported)\s+(supercharger\s+|blower\s+)?pulley\b|\bpulley\s+(upgrade|swap)\b|\bstage\s?[1-9]\b|\b(bigger|larger|upgraded)\s+turbo|\b(added|increased|more)\s+boost\b|\bbig[-\s]?bore\b|\bstroke[rd]\b|\bforged\s+(internals|pistons|rods|crank)|\bbuilt\s+(engine|motor|\d)|\b(engine|motor)\s+(swap|conversion)\b|\bswapped\b|\b(ls|lt)[1-9]\s+(swap|conversion)|\bwide[-\s]?body\b|\bbody\s?kit\b|\brestomod\b|\bresto[-\s]mod\b|\bconversion\s+kit\b|\bcustom\s+tune\b[^.;,\n]*\b(boost|turbo)|\brebuilt\s+to\s+\d|\bbored\s+(out|to|\d)|\bincreased\s+displacement\b/i;
const MOD_CHANGE = /\b(swap|swapped|converted|conversion|aftermarket|installed|added|upgraded|retrofitted)\b/i;
const MOD_PART = /\b(engine|motor|turbo|turbos|turbocharger|turbochargers|turbocharged|supercharger|supercharged|blower|turbo\s?kit|camshafts?|cams|cylinder\s+heads|pistons|internals|fenders)\b/i;   // e65 (Sam): a roll cage never sets a sale aside on its own; body changes are the standalone widebody, body kit and body widened
const MOD_MAINT = /\b(rebuilt|rebuild|replaced|replacement|remanufactured|serviced|refreshed|overhauled|resealed|reinstalled|original|factory|oem|correct|stock)\b/i;
const MOD_FEATURE_STEMS = [["turbo", /turbo/i], ["supercharg", /supercharg|kompressor|blower/i], ["tdi", /tdi\b|diesel/i], ["v8", /\bv8\b/i], ["v12", /\bv12\b/i], ["v10", /\bv10\b/i], ["hemi", /\bhemi\b/i]];
const MOD_PREFIX_ENGINE = /powered|engined|turbocharged|supercharged|twin[-\s]?turbo|\bturbo\b|\b(ls|lt)[1-9]\b|\bv8\b|\bv12\b|hellcat|coyote|vortec|cummins|duramax|hemi|swap|modified/i;
// The stems that are features of THIS pool (half or more of the fetched titles carry them). Set by fetchQualifying.
export function modFeatureStems(rows) {
  const titles = (rows || []).map(r => String(r.raw_title || r.rtitle || ""));
  if (titles.length < 4) return new Set();
  const out = new Set();
  for (const [k, re] of MOD_FEATURE_STEMS) if (titles.filter(t => re.test(t)).length * 2 >= titles.length) out.add(k);
  return out;
}
const modStemOf = text => { for (const [k, re] of MOD_FEATURE_STEMS) if (re.test(text)) return k; return null; };
// The full modified set-aside the qualifier applies (a described change, or a builder/outlaw title mark), with its words.
export function modSetAsideReason(row, spec) {
  const t = modChangeTrigger(row, spec); if (t) return t;
  const lt = String(row.raw_title || row.rtitle || "").toLowerCase();
  const mk = MOD_MARKERS.find(w => lt.includes(w));
  return mk ? `title mark: "${mk}"` : null;
}
// The words that set this sale aside, or null. Exported for the spot-check read (the exact trigger words).
export function modChangeTrigger(row, spec) {
  const feats = (spec && spec._featureStems) || new Set();
  const mods = row.mods == null ? "" : String(row.mods);
  const title = String(row.raw_title || row.rtitle || "");
  for (const clause of mods.split(/[;\n]+|[.,](?=\s|$)|\s+and\s+|\s+&\s+|\x22\s*,\s*\x22/i)) {
    const c = clause.trim(); if (!c) continue;
    const st = MOD_STANDALONE.exec(c); if (st) return `modifications text: "${st[0]}"`;
    // e66 (the 2018 Mustang GT after-read, Sam's "added boost" rule): a forced-induction part LISTED in the seller's changes
    // ("Supercharger", "Roush supercharger fitted") on a car whose own sale titles do not carry boost is added boost, even
    // with no change word. Maintenance or factory words ("rebuilt", "factory supercharger") and a model whose titles carry
    // it (the prevalence guard) keep the sale in.
    const bare = c.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.]+$/g, "");
    const fi = /^(?:[\w-]+\s+)?(supercharger|turbocharger|turbochargers|twin[-\s]?turbos?|blower)(?:\s+(?:fitted|installed|added|kit|system|upgrade))?$/i.exec(bare);
    if (fi && !MOD_MAINT.test(bare) && !feats.has(modStemOf(fi[1]) || "")) return `modifications text: "${fi[0].trim()}"`;
    // e66 (the e65 extent read): "engine" or "motor" naming an ACCESSORY is not an engine part ("Aftermarket engine cover",
    // "Engine fan added", "Aftermarket Motor Mounts", "Engine intake upgraded to six carburetors"); those are bolt-ons.
    const cNoAcc = c.replace(/\b(engine|motor)\s+(cover|covers|fan|fans|mounts?|bay|intake|management|software|tune|tuning|oil|wiring|harness|computer|ecu|dress(?:[\s-]?up)?|lid|hood|detailing|blanket|shroud|stand)\b/ig, "$2");
    const ch = MOD_CHANGE.exec(cNoAcc), pt = MOD_PART.exec(cNoAcc);
    if (ch && pt) {
      if (MOD_MAINT.test(c) && !/\b(aftermarket|swap|swapped|converted|conversion|added)\b/i.test(c)) continue;   // a stock rebuild or replacement
      const stem = modStemOf(pt[0]); if (stem && feats.has(stem)) continue;                                        // a feature of this model
      return `modifications text: "${ch[0]}" with "${pt[0]}"`;
    }
  }
  const yr = Number(((/\b(19|20)\d{2}\b/.exec(title)) || [])[0]) || Number(row.year) || null;
  if (yr && yr < 1997) { const ls = /\b(ls|lt)[1-9]\b|\bls[\s-]?swap/i.exec(mods); if (ls) return `modifications text: "${ls[0]}" in a car built before 1997`; }
  const ym = /\b(19|20)\d{2}\b/.exec(title);
  const prefix = ym ? title.slice(0, ym.index) : "";
  const pm = prefix ? MOD_PREFIX_ENGINE.exec(prefix) : null;
  if (pm) { const stem = modStemOf(prefix); if (!(stem && feats.has(stem) && !/swap|modified/i.test(prefix))) return `title in front of the year: "${prefix.trim()}"`; }
  return null;
}
// Item 9: OBSERVABLE listing facts (mined from the pool's own title / modifications / title-status
// / known-flaws / description) - never a condition GRADE, never a price adjustment. Offered as the
// post-answer "Anything I should know?" refinement only when the pool actually contains such cars;
// tapping one holds those cars OUT of the main band and reports THEIR range as an aside sentence.
const OBSERVE_FLAGS = {
  needs_work: { label: "needing work", re: /\bproject\b|needs?\s?work|not\s?runn|non[-\s]?runn|barn find|recommission|for restoration|\bas[-\s]?is\b|running when parked|parts car|unfinished|incomplete/i },
  modified: { label: "modified", re: SUBSTANTIAL_MOD },
  salvage: { label: "having a salvage or rebuilt title", re: /salvage|rebuilt title|branded title|reconstruct|flood|lemon\s?law|prior damage/i }
};
const OBSERVE_ORDER = ["needs_work", "modified", "salvage"];
// The observable text for a record: everything a mined flag can honestly read (all fetched fields
// plus the description when the bounded second fetch has attached it).
function obText(r) { return [titleOf(r), r.mods, r.ts, r.flaws, r._descText].filter(Boolean).join(" "); }
// Title markers that mean "not a stock, standard example."
const MOD_MARKERS = [
  "backdate", "backdated", "outlaw", "restomod", "resto-mod", "hot rod", "hotrod",
  "custom", "widebody", "wide-body", "tribute", "recreation", "replica", "singer",
  "rwb", "safari", "turbo-look", "turbo look", "slantnose", "slant nose", "swap",
  // "competition" removed (Sep 2026): it is a FACTORY trim/package (BMW M3/M4/M5 Competition,
  // and others), not a modification - it was rejecting every M Competition as "non-stock" and
  // gutting the pool. Genuine race cars are still caught by "race car" + SUBSTANTIAL_MOD (race
  // prep / roll cage). A factory trim name must never live in a modification-marker list.
  "project", "race car", "continuation", "kit car", "tool room",
  "toolroom", "gasser", "chopped", "rat rod", "parts car",
  // e65: builder and conversion marks in the title stay set aside now that the modifications text is read narrowly
  "reimagined", "ruf-", "ruf modified", "rwb-", "-modified", "-converted", "conversion",
  // an off-road race build (a 2019 F-150 HM Elite Prerunner at $195,000) is an outlaw build, set aside by its title
  "prerunner", "pre-runner", "trophy truck"
];

// Body-style vocabulary, so a Coupe query never draws in a Targa or Cabriolet.
const BODY_SYNONYMS = {
  coupe: ["coupe", "coupé", "berlinetta", "fastback", "hardtop", "notchback"],
  targa: ["targa"],
  cabriolet: ["cabriolet", "cabrio", "convertible", "spyder", "spider", "roadster", "drophead", "dhc"],
  convertible: ["convertible", "cabriolet", "cabrio", "spyder", "spider", "roadster", "drophead", "dhc"],
  roadster: ["roadster", "spyder", "spider", "convertible", "cabriolet"],
  sedan: ["sedan", "saloon", "berlina"],
  wagon: ["wagon", "estate", "avant", "touring", "shooting brake"]
};

const PLATFORM_NAMES = {
  bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", pcarmarket: "PCarMarket",
  hagerty: "Hagerty", hemmings: "Hemmings", rmsothebys: "RM Sotheby's", gooding: "Gooding & Co",
  sothebysmotorsport: "Sotheby's Motorsport", autohunter: "AutoHunter", mbmarket: "MB Market",
  allcollectorcars: "AllCollectorCars", acc: "AllCollectorCars", bonhams: "Bonhams",
  barrettjackson: "Barrett-Jackson", mecum: "Mecum", carandclassic: "Car & Classic",
  collectingcars: "Collecting Cars", broadarrow: "Broad Arrow"
};
const platformName = s => PLATFORM_NAMES[String(s || "").toLowerCase()] || (s ? String(s) : "");

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function monthName(dateStr) {
  const p = String(dateStr || "").slice(0, 10).split("-");
  return p.length >= 2 ? (MONTHS[Number(p[1])] || null) : null;
}
// The OUTCOME of a sale in USD: what the buyer actually paid (premium-INCLUSIVE display),
// converted to USD so a single answer-line range never mixes currencies. Distinct from the
// engine's `value` (USD implied HAMMER, premium backed out) which is the ranking/compute
// basis only. The answer line is about what cars BROUGHT, so it uses the outcome.
function outcomeUsd(row) {
  const d = priceDisplay(row);
  if (d.amount == null) return null;
  const dateISO = row.date || row.sale_date || row.auction_end_date || null;   // item 1: dated FX
  return d.currency === "USD" ? Math.round(d.amount) : Math.round(toUsd(d.amount, d.currency, dateISO));
}
function soldLabel(dateStr) {
  if (!dateStr) return "Sold recently";
  const p = String(dateStr).slice(0, 10).split("-");
  if (p.length < 2) return "Sold recently";
  return `Sold ${MONTHS[Number(p[1])] || ""} ${p[0]}`.replace(/\s+/g, " ").trim();
}

// Body style the seller actually typed (never inferred). Null = unspecified.
export function detectBodyStyle(text) {
  const t = String(text || "").toLowerCase();
  // "Gullwing" is the 300SL COUPE by name (bug 6), so it scopes to the coupe and never asks body.
  if (/\bgullwing\b/.test(t)) return "coupe";
  for (const canonical of ["targa", "fastback", "coupe", "cabriolet", "convertible", "roadster", "wagon", "sedan"]) {
    if (t.includes(canonical)) return canonical;
  }
  return null;
}
// Display label for a detectBodyStyle() value - the body-question chip text (Oct 2026).
export const BODY_LABEL = { targa: "Targa", fastback: "Fastback", coupe: "Coupe", cabriolet: "Cabriolet", convertible: "Convertible", roadster: "Roadster", wagon: "Wagon", sedan: "Sedan" };

// The $2,500 collector-car floor (Part 3). A displayed price never falls below it; a
// sub-floor record is a part/memorabilia/data error, not a car, and is dropped from the pool.
const DISPLAY_FLOOR = 2500;
// VEHICLE-TYPE filter (Lane A classifier, Fix 5): sales_archive.vehicle_type is car|motorcycle|
// other|non_vehicle. The engine car pools read ONLY cars - so a part/memorabilia/automobilia row
// (non_vehicle), a motorcycle, or an off-highway "other" never counts, even when its hammer clears
// the $2,500 floor (a $40k engine would slip the price floor; vehicle_type catches it). STRICT now
// (vehicle_type=eq.car): Lane A has typed every make-known row (292,440 cars), so the NULL-as-car
// bridge is retired - a NULL row is genuinely unclassified and stays out of a car pool. Appended to
// every car-pool fetch. (Earlier interim form: or=(vehicle_type.is.null,vehicle_type.eq.car).)
const VT_CAR = "&vehicle_type=eq.car";

// SUB-TRIM FENCE (Part 3 bug 2): within one generation a NAMED base/sub trim pools ONLY itself - a
// "911 Carrera" never mixes in a Carrera S / T / GTS, and vice versa. Title-based (the archive carries
// the sub-trim only in the title). Extensible to any family whose trims are named in the title.
// `noManual` marks the base trims a generation offered PDK-only, so a manual request widens to the
// manual-capable trims (S/T) instead of an empty base pool, and trimsCovered names them.
// Chassis-code match (Oct 2026 fix): the archive files a 911 generation as its OWN model ("993",
// "996", "997", "991", "992" - lib/generations.js mirrors these), so a "993 Carrera" query resolves
// spec.model to "993", never "911". The fence table was keyed to literally "911" only, so a chassis-
// code query never consulted it at all - the base "Carrera" trim's exclude (meant to keep Carrera 4/
// 4S out) silently never ran, and those cars leaked into the plain Carrera pool and its last-three.
// Confirmed live: a "993 Carrera 4S" sale appeared under the "993 Carrera" panel's own recent3 before
// this fix. 901/930/964/993/996/997/991(.1/.2)/992(.1/.2) are every 911 chassis code OCD/the archive
// has ever used as a model name on its own.
const NINE_ELEVEN_MODEL_RE = /^(911|901|930|964|993|996|997|991(\.[12])?|992(\.[12])?)$/i;
const SUBTRIM_FENCES = [
  { make: /porsche/i, model: NINE_ELEVEN_MODEL_RE, noManual: /^carrera(\s*[24])?$/i, fences: [
    // Carrera (rear-drive, "Carrera 2" on the 964) EXCLUDES the all-wheel-drive Carrera 4 / 4S: they
    // are a different market. "Carrera 2" and bare "Carrera" both land here; "Carrera 4" has its own
    // fence below.
    // base: true (Oct 2026, item 2): the trim QUESTION's default pool when none is stated - "Carrera
    // and Carrera S", the pair a plain "911" nameplate means in ordinary use. Every other named fence
    // here (Carrera 4/4S, T, GTS, Turbo, Turbo S, 911 R, GT3/Touring) is a distinct option offered by
    // the question, never silently folded in or silently excluded by a statistical guess.
    { trim: /^carrera(\s*2)?$/i, name: "Carrera", base: true, include: /\bcarrera\b/i, exclude: /\bcarrera\s*4\b|\bcarrera\s*4?\s*s\b|\bcarrera\s*t\b|\bgts\b|\bturbo\b|\bgt\s?[0-9]|speedster|sport\s?classic|\bs\/t\b|dakar/i },
    { trim: /^carrera\s*4$/i, name: "Carrera 4", include: /\bcarrera\s*4\b/i, exclude: /\bcarrera\s*4\s*s\b|\bcarrera\s*t\b|\bgts\b|\bturbo\b|\bgt\s?[0-9]|speedster|sport\s?classic/i },
    // Carrera S (rear-drive) and Carrera 4S (AWD) are SEPARATE objects, split like Carrera 2/4.
    { trim: /^carrera\s*s$/i, name: "Carrera S", base: true, include: /\bcarrera\s*s\b/i, exclude: /\bcarrera\s*4\s*s\b|\bcarrera\s*4\b|\bgts\b|\bcarrera\s*t\b|\bturbo\b|\bgt\s?[0-9]/i },
    { trim: /^carrera\s*4\s*s$/i, name: "Carrera 4S", include: /\bcarrera\s*4\s*s\b/i, exclude: /\bgts\b|\bcarrera\s*t\b|\bturbo\b|\bgt\s?[0-9]/i },
    { trim: /^carrera\s*t$/i, name: "Carrera T", include: /\bcarrera\s*t\b/i, exclude: /\bgts\b|\bturbo\b|\bgt\s?[0-9]/i },
    { trim: /(carrera\s*4?\s*)?gts$/i, name: "GTS", include: /\bgts\b/i, exclude: /\bturbo\b|\bgt\s?[0-9]|gt3|gt2/i },
    // A TURBO is only the Turbo TRIM. Exclude turbo-LOOK / turbo-body / Turbo Twist wheels / WTL (a
    // Carrera dressed as a Turbo), the Carrera it rides on, the separate Turbo S, and the GT2.
    { trim: /^turbo$/i, name: "Turbo", include: /\bturbo\b/i, exclude: /turbo[\s-]?(look|style|body|twist|optik)|\bwtl\b|\bcarrera\b|\bgt2\b|\bturbo\s*s\b|speedster/i },
    { trim: /^turbo\s*s$/i, name: "Turbo S", include: /\bturbo\s*s\b/i, exclude: /turbo[\s-]?(look|style|body|twist|optik)|\bwtl\b|\bcarrera\b|\bgt2\b/i },
    // The 911 R (991, 2016, manual-only) is titled "911 R"; bare trim "R" had no fence and pooled the
    // whole Carrera manual set. Scope to the "911 R" title; exclude Carrera / GT / RS / Turbo.
    { trim: /^r$/i, name: "911 R", include: /\b911\s*r\b/i, exclude: /\bcarrera\b|\bgt\s?[0-9]|\brs\b|\brsr\b|\bturbo\b|\bgt3\s*r\b/i },
    // GT3 Touring (wingless) is its own object, split from the winged GT3 (like Carrera S / 4S). Plain
    // GT3 excludes Touring and RS; GT3 Touring requires the Touring word.
    { trim: /^gt3\s*touring$/i, name: "GT3 Touring", include: /\btouring\b/i, exclude: /gt3\s*rs|\brs\b|\bturbo\b|gt2/i },
    { trim: /^gt3$/i, name: "GT3", include: /\bgt3\b/i, exclude: /gt3\s*rs|\brs\b|\btouring\b|gt2|\bturbo\b/i }
  ] },
  // Dodge Charger R/T: a distinct, well-known Mopar performance trim, titled "Charger R/T" (slash) in
  // the archive. Without this fence, a trim of "R/T" carried no pool-scoping effect at all (label only)
  // and a bare "Charger" query's full model-wide pool answered the R/T ask. Daytona/Superbird/Super Bee/
  // SRT/Hellcat are excluded (separate halos, already set aside elsewhere by HALO_PATTERNS; redundant
  // here but harmless).
  { make: /dodge/i, model: /^charger$/i, fences: [
    { trim: /^r\s*\/?\s*t$/i, name: "R/T", include: /\br\s?\/?\s?t\b/i, exclude: /\bdaytona\b|\bsuperbird\b|\bsuper\s?bee\b|\bsrt\b|\bhellcat\b/i }
  ] }
];
function subTrimFenceFor(make, model, trim) {
  const t = String(trim || "").trim(); if (!t) return null;
  for (const g of SUBTRIM_FENCES) {
    if (!g.make.test(make || "") || !g.model.test(String(model || "").trim())) continue;
    const f = g.fences.find(x => x.trim.test(t));
    if (f) return { ...f, noManualBase: !!(g.noManual && g.noManual.test(t)) };
  }
  return null;
}
// The SUBTRIM_FENCES group for a make+model, or null - the shared lookup the trim QUESTION (item 2,
// Oct 2026) uses to find a family's named trims when the query itself gives none.
function subTrimGroupFor(make, model) {
  return SUBTRIM_FENCES.find(g => g.make.test(make || "") && g.model.test(String(model || "").trim())) || null;
}
const trimSlug = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// Distinct sub-trims present in a 911 pool, for resolvedCar.trimsCovered (Lane C eyebrow). Ordered
// base -> S -> T -> GTS. Only computed for the 911 Carrera family today.
function detectSubTrims(rows, make, model) {
  if (!/porsche/i.test(make || "") || !NINE_ELEVEN_MODEL_RE.test(String(model || "").trim())) return [];
  const has = { "Carrera": false, "Carrera S": false, "Carrera T": false, "GTS": false };
  for (const r of rows || []) {
    const t = titleOf(r);
    if (/\bcarrera\s*4?\s*gts\b|\b911\s*gts\b|\bgts\b/i.test(t)) has["GTS"] = true;
    else if (/\bcarrera\s*t\b/i.test(t)) has["Carrera T"] = true;
    else if (/\bcarrera\s*4?\s*s\b/i.test(t)) has["Carrera S"] = true;
    else if (/\bcarrera\b/i.test(t)) has["Carrera"] = true;
  }
  return Object.keys(has).filter(k => has[k]);
}

// BADGE-TWIN SIBLINGS (thin-result helper): genuinely the SAME car sold under another marque (shared
// platform / badge engineering), so when a thin result has too few sales of the queried car, its twin
// may carry a deeper record worth pointing at. High-confidence, collector-relevant twins only; a twin
// is NOT a mere platform cousin. Bidirectional; each entry lists every co-twin. The suggestion is
// additive (thin.sibling) and never changes the queried car's own pool. relation names the tie.
// Each member is [make, modelToken, displayLabel].
const SIBLING_FAMILIES = [
  { members: [["eagle", "talon", "Eagle Talon"], ["mitsubishi", "eclipse", "Mitsubishi Eclipse"], ["plymouth", "laser", "Plymouth Laser"]], relation: "Diamond Star Motors twin" },
  { members: [["dodge", "stealth", "Dodge Stealth"], ["mitsubishi", "3000gt", "Mitsubishi 3000GT"]], relation: "badge-engineered twin" },
  { members: [["ford", "probe", "Ford Probe"], ["mazda", "mx-6", "Mazda MX-6"]], relation: "shared platform" },
  { members: [["toyota", "gr86", "Toyota GR86"], ["toyota", "86", "Toyota 86"], ["scion", "fr-s", "Scion FR-S"], ["subaru", "brz", "Subaru BRZ"]], relation: "co-developed twin" },
  { members: [["chevrolet", "camaro", "Chevrolet Camaro"], ["pontiac", "firebird", "Pontiac Firebird"]], relation: "F-body twin" },
  { members: [["pontiac", "gto", "Pontiac GTO"], ["holden", "monaro", "Holden Monaro"]], relation: "rebadged Holden Monaro" },
  { members: [["chevrolet", "ss", "Chevrolet SS"], ["holden", "commodore", "Holden Commodore"]], relation: "rebadged Holden Commodore" },
  { members: [["saab", "9-2x", "Saab 9-2X"], ["subaru", "impreza", "Subaru Impreza"]], relation: "shared Subaru platform" },
  { members: [["toyota", "supra", "Toyota Supra"], ["bmw", "z4", "BMW Z4"]], relation: "co-developed twin (A90/G29)" }
];
const sibNorm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// The single best sibling for a resolved spec: the first co-twin of a matched family. Twin-matching is
// token-based (sibNorm), so "3000GT"/"3000 gt" and "MX-6"/"mx6" both hit.
function siblingFor(spec) {
  if (!spec || !spec.make || !spec.model) return null;
  const mk = sibNorm(spec.make), md = sibNorm(spec.model);
  for (const fam of SIBLING_FAMILIES) {
    if (!fam.members.some(([a, b]) => sibNorm(a) === mk && sibNorm(b) === md)) continue;
    const other = fam.members.find(([a, b]) => !(sibNorm(a) === mk && sibNorm(b) === md));
    if (other) return { make: other[0], model: other[1], label: other[2], relation: fam.relation };
  }
  return null;
}
// Bounded, archive-only count of a sibling's recent sales (zero OldCarsData). Cars only, above the
// $2,500 floor, last 36 months, scoped to the subject's year window when present. Returns the count
// (capped at the fetch limit) or 0. Best-effort: a failed/empty read yields 0 (the sibling is simply
// not surfaced), never throws into the thin result.
async function siblingSaleCount(sib, spec, env) {
  try {
    if (!sib || !env) return 0;
    const since = new Date(obNow() - 1096 * 864e5).toISOString().slice(0, 10);
    const yq = (spec.yearMin ? `&year=gte.${spec.yearMin}` : (spec.year ? `&year=gte.${spec.year - 2}` : "")) +
               (spec.yearMax ? `&year=lte.${spec.yearMax}` : (spec.year ? `&year=lte.${spec.year + 2}` : ""));
    const q = `sales_archive?select=id&make=ilike.${encodeURIComponent("*" + sib.make + "*")}` +
      `&model=ilike.${encodeURIComponent("*" + sib.model + "*")}&sale_price=not.is.null${VT_CAR}` +
      `&sale_date=gte.${since}${yq}&limit=500`;
    const rows = (await supabaseSelect(env, q)) || [];
    return rows.length;
  } catch (e) { return 0; }
}
// Attach a sibling suggestion to a thin object when a real twin exists and carries enough of its own
// record (>=3 recent sales) to be worth pointing at. Mutates and returns the thin object; a no-op when
// there is no twin or the twin is itself thin. The queried car's own pool is never touched.
async function attachSibling(thin, spec, env) {
  if (!thin) return thin;
  const sib = siblingFor(spec);
  if (!sib) return thin;
  const count = await siblingSaleCount(sib, spec, env);
  if (count >= 3) {
    const yr = spec.year ? spec.year + " " : "";
    thin.sibling = { label: sib.label, count, query: `${yr}${sib.make} ${sib.model}`, relation: sib.relation };
  }
  return thin;
}
// Chevrolet Blazer kind signals (shared by buildSpec routing and qualifyReason filtering). Full-size
// = K5 and its truck-code/engine/trim tells; compact = S-10 and its tells. TrailBlazer is excluded
// separately (a different model). LS/LT are deliberately NOT a compact signal here (both lines used
// them), so they never force a cross-kind call.
const BLAZER_FULL_RE = /k-?5\b|\bk10\b|\bk20\b|\bk1500\b|\bk2500\b|\bc10\b|\bd10\b|full[-\s]?size|\b5\.7\b|\b350\b|\b6\.[25]\b|diesel|silverado|cucv|m1009/i;
const BLAZER_COMPACT_RE = /s-?10\b|\b4\.3\b|\b2\.8\b|4[-\s]?door|\bzr2\b|xtreme/i;
// A candidate row (flattened select) qualifies when it is a real sold price, has a
// usable photo, is stock (empty modifications + no modified-title marker), and,
// when the seller named a body style, matches it and is not a different variant.
// Compound-trim guard (Oct 2026, trim contamination sweep): a shorter trim's word-boundary match is
// ALSO satisfied by a longer, genuinely different compound trim the archive titles in full ("Turbo
// S" contains a standalone "S" token AND a standalone "Turbo" token) - the plain regex alone cannot
// tell "Cayenne S" or "Cayenne Turbo" from "Cayenne Turbo S", since all three share a token with it
// (confirmed live: a bare "S" search pulled in Cayenne Turbo S cars - no SUBTRIM_FENCES entry
// exists for Cayenne/Panamera/Macan the way 911 has one). Each FULL pattern below is an
// unambiguous, separately-named TRIM LEVEL (never a generic options package, which would make this
// too aggressive): when the title matches the FULL compound and the searched trim text does NOT
// ALSO match that same full compound, the row is a more specific trim than what was asked for.
// Mirrors what SUBTRIM_FENCES' own explicit exclude regexes already do for 911 (e.g. its Turbo
// fence excludes "\bturbo\s*s\b"); this generalizes the same idea for every model with no fence.
const COMPOUND_TRIM_QUALIFIERS = [/\bturbo\s*s\b/i, /\bgts\b/i];
// Reason a row is NOT a qualifying comp for the spec, or null when it qualifies. isQualifying
// is the boolean wrapper (unchanged behavior); Sam Desk uses the reason so an excluded row can
// be SHOWN with why (no silent drops), matching how One Box drops it.
// TITLE/YEAR FENCE (job 3, trim-fence sweep, Oct 2026): every title-and-year-based membership rule
// the sales pool applies - model family, sub-trim, trim-as-part, performance badge, modified/replica/
// conversion markers, trim/halo scope, body style - extracted from qualifyReason into its OWN
// function so a SECOND consumer (the live "comparable right now" panel, lib/live/search.js
// liveForFamily) can run the identical check on a listing's title before counting it as a comparable,
// instead of a parallel, looser set of rules. qualifyReason calls this too (right after its own
// price/photo/floor gates, which make no sense for a still-listed, not-yet-sold car) - ONE function,
// two callers, never a second copy. Confirmed live before this fix: a bare "2025 Porsche 911
// Cabriolet" search's live panel showed a "2022 Porsche 911 Turbo S Cabriolet" (no trim fence at
// all in the live path), and a "2005 BMW M3 Coupe" search's panel showed a "2004 BMW 330Ci ZHP
// Coupe" (not an M3 at all - no badge check) and a "... Competition Package Coupe Conversion" (a
// conversion, never caught). Takes the same `row`/`spec` shapes qualifyReason already uses; a caller
// outside the sales-pool fetch (a live listing) passes a minimal row carrying just raw_title/rtitle/
// year/mods/project_flag - every field this function reads.
export function titleFenceReason(row, spec) {
  // Parts / automobilia guard. See lib/_classify.js.
  if (isPartsListing(row.raw_title || row.rtitle, row.mileage)) return "part or automobilia";
  // Memorabilia / replica / tribute / scale-model guard.
  if (isMemorabilia(row.raw_title || row.rtitle)) return "memorabilia or replica";
  // PROTOTYPE flag (shared with Sell's/Market Check's title-keyword last resort, lib/_classify.js): an
  // engineering/development prototype is not a standard production comp. Title-matched, flagged out of
  // every pool (spec pages included, via this same qualifyReason), never deleted from the archive row.
  if (isPrototype(row.raw_title || row.rtitle)) return "prototype";
  // RACE CAR guard: a Cup/RSR/GT3 R/GT3 Cup/Supercup/race-car/track-car title is never a road-car comp
  // (same principle as the 911 R fence) - UNLESS the query itself names that race trim (so a "GT3 Cup"
  // or "RSR" query still pools its own car; rule 16's self-guard).
  { const t2 = stripRaceNoise(row.raw_title || row.rtitle || ""); if (RACE_TITLE_RE.test(t2) && !RACE_TITLE_RE.test(String(spec.trim || "") + " " + String(spec.model || ""))) return "race car"; }
  // TITLE YEAR vs YEAR COLUMN (e40, Oct 15 2026, found by the span scan): a "2003 Mercedes-Benz SL55 AMG" filed
  // with year 2023 sat in a 2023 SL-Class pool. When the listing's own title carries a model year that disagrees
  // with the record's year column by more than a year AND falls outside the pool's year bound, the title wins
  // and the row is out. A one-year disagreement inside the bound is left alone (model-year vs build-year).
  { const ty = Number((String(row.rtitle || row.raw_title || "").match(/\b((?:19|20)\d{2})\b/) || [])[1]); const ry = Number(row.year);
    if (ty && ry && Math.abs(ty - ry) > 1 && Number.isFinite(spec.yearMin) && Number.isFinite(spec.yearMax) && (ty < spec.yearMin || ty > spec.yearMax)) return "model year in the title disagrees with the record"; }
  // Project / incomplete / shell / non-original car (item 1): a shell, roller, parts car, no-engine
  // project, salvage car or replica is never a comp for a complete running car. Title-level here is
  // cheap and applies on EVERY pool; the house/thin pool also reads the description (where the "shell"
  // detail usually lives) via a bounded enrich + filterProjectRows pass.
  { const pf = row.project_flag || projectFlagReason(row.raw_title || row.rtitle, row._descText || null); if (pf) return "project or incomplete car (" + pf + ")"; }
  // MODEL FAMILY scope (item 2): a Shelby Cobra family query pools ONLY its family. A 289 can never
  // sit in a 427 pool, the Daytona (halo) sits in neither original pool, and a replica/kit builder car
  // is out of every family (the official continuation is CSX4000+, not a Superformance/Factory Five).
  if (spec.familyInclude) {
    const rawTtl = row.raw_title || row.rtitle || "";
    if (!spec.familyInclude.test(rawTtl)) return "different Cobra family";
    if (spec.familyExclude && spec.familyExclude.test(rawTtl)) return "other Cobra family";
    if (COBRA_REPLICA_RE.test(rawTtl) || /\bERA\b/.test(rawTtl)) return "replica or kit car";
  }
  // SUB-TRIM FENCE (bug 2): a named base/sub trim pools only itself ("911 Carrera" excludes S/T/GTS).
  if (spec.subTrimInclude) {
    const stt = row.raw_title || row.rtitle || "";
    if (!spec.subTrimInclude.test(stt)) return "different sub-trim of the model";
    if (spec.subTrimExclude && spec.subTrimExclude.test(stt)) return "higher sub-trim set aside";
  }
  const title = String(row.rtitle || row.raw_title || "").toLowerCase();
  // Truck series-code match must be EXACT on the series letter (item 1): a "D350" query is a one-ton
  // D-series pickup - it matches D350 (and its 4x4 twin W350), NEVER a B350 van or any other letter's
  // 350. The loose comp fetch (D->"D*350"->%D%350%) pulls "Dodge ... 350" strings, so gate it here.
  // Only for truck makes + a single-letter+3-digit model, so a Mercedes "E350" etc. is untouched.
  if (spec.make && /^(dodge|ram|ford|chevrolet|chevy|gmc)$/i.test(String(spec.make).trim())) {
    const sc = /^([a-z])(\d{2,3})$/i.exec(String(spec.model || "").trim());
    if (sc) {
      // A rebadged family sibling (change 4a: Ram 50, Plymouth Arrow Truck, Mitsubishi Mighty Max for
      // a D50 query) is pooled by poolTerms and bypasses the truck-series number check.
      const familySibling = spec._poolTerms && spec._poolTerms.some(t => title.includes(String(t).toLowerCase()));
      if (!familySibling) {
        const letter = sc[1].toUpperCase(), num = sc[2];
        const fam = /^[DW]$/.test(letter) ? "[DW]" : letter;   // Dodge pickups: D and its 4x4 twin W
        // Separator-flexible (item 1): the loose "D*50" fetch pulls "D 50"/"D-50" AND "D350"; accept
        // the series with an optional separator, reject the wrong-number series (D350 for a D50 query).
        if (!new RegExp(`\\b${fam}[\\s-]?${num}\\b`, "i").test(title)) return "different truck series";
      }
    }
  }
  // LETTER-NUMBER MODEL CODES (e65, Sam: a 2020 Ford Transit 150 van sat in the F-150 pool). A model written as letters,
  // an optional hyphen or space, then digits (F-150, F-250, C-10, K-5, D-100) is matched at the database with a wildcard
  // ("*F*150*"), so a title with any F before any 150 ("Ford Transit 150") came in. The title must name the code itself,
  // with word boundaries, in any of its spellings (F-150, F150, F 150).
  {
    const code = /^([A-Za-z]{1,3})[\s-]?(\d{2,4})$/.exec(String(spec.model || "").trim());
    if (code && !(spec._poolTerms && spec._poolTerms.length) && !new RegExp(`\\b${code[1]}[\\s-]?${code[2]}\\b`, "i").test(title)) return "a different model (the code is not in the title)";
  }
  // Ford GT standalone supercar (item 3, Sep 2026): the model "GT" is a generic token that the loose
  // comp fetch pulls GT40 / GT350 / GT500 / Mustang GT into. Scope to the standalone car - reject any
  // title carrying another model name or a different GT badge. The year window (year +/-2) splits the
  // two Ford GT generations (2005-06 vs 2017+) on its own, so no extra generation handling is needed.
  if (spec.make && /^ford$/i.test(String(spec.make).trim()) && /^gt$/i.test(String(spec.model || "").trim())) {
    if (/mustang|shelby|gt\s?-?\s?40|gt\s?-?\s?350|gt\s?-?\s?500|\bgt3\b|\bgt4\b/i.test(title)) return "different Ford GT variant";
    if (!/\bgt\b/i.test(title)) return "not a Ford GT";
  }
  // Land Rover Range Rover sub-model identity: the full-size "Range Rover" is a different car and
  // market from the Range Rover Sport / Evoque / Velar, each its own model. The base model's loose
  // title match ("range rover") pulls the sub-models in, so gate on the sub-model token. A base
  // full-size query rejects any Sport / Evoque / Velar title; a sub-model query requires its own token.
  if (spec.make && /^land[\s-]?rover$/i.test(String(spec.make).trim()) && /^range\s*rover/i.test(String(spec.model || "").trim())) {
    const m = String(spec.model).toLowerCase();
    const sub = /\bsport\b/.test(m) ? "sport" : /\bevoque\b/.test(m) ? "evoque" : /\bvelar\b/.test(m) ? "velar" : null;
    if (!sub) { if (/\b(sport|evoque|velar)\b/i.test(title)) return "Range Rover sub-model, not the full-size"; }
    else if (!new RegExp("\\b" + sub + "\\b", "i").test(title)) return "different Range Rover model";
  }
  // SIBLING-MODEL guard: a DIFFERENT, separately-named vehicle that merely borrows or contains the
  // queried model's own name must never pool as that model. Two distinct failure shapes, same fix:
  // (a) a SUBSTRING with no word boundary - the archive model-column ILIKE "*charger*" also matches
  // "Ramcharger" (a different truck; a regex \bcharger\b correctly fails to match inside "Ramcharger"
  // since there is no boundary there, but the raw SQL ILIKE has no such concept, so the guard must
  // reject explicitly); (b) a SEPARATE model that borrows the nameplate as its own sub-brand with a
  // real word boundary ("Mustang Mach-E" is an unrelated EV crossover, not a Mustang trim - unlike
  // "Mustang Mach 1", a genuine trim of the base Mustang, which must stay IN the pool). Curated per
  // make|model; checked unconditionally (these are different cars under every scoping mode).
  const SIBLING_MODEL_EXCLUDE = {
    "dodge|charger": /\bramcharger\b/i,
    "ford|mustang": /\bmach-?e\b/i,
    "ford|bronco": /\bbronco\s*sport\b/i
  };
  { const sibEx = SIBLING_MODEL_EXCLUDE[`${String(spec.make || "").toLowerCase().trim()}|${String(spec.model || "").toLowerCase().trim()}`]; if (sibEx && sibEx.test(title)) return "different model (sibling nameplate)"; }
  // Chevrolet Blazer family kind-filter: the broad "Blazer" fetch pulls K5 (full-size), S-10 (compact)
  // and the 2019+ crossover; keep only the kind the query resolved to. TrailBlazer is a DIFFERENT
  // model and is always excluded. A no-clue bare "Blazer" title stays out of both the K5 and S-10 pool
  // (it is unidentifiable), so the pools never cross-contaminate.
  if (spec.blazerKind) {
    if (/trail\s?blazer/i.test(title)) return "TrailBlazer, a different model";
    const full = BLAZER_FULL_RE.test(title), compact = BLAZER_COMPACT_RE.test(title);
    const y = Number(row.year) || Number((String(row.rtitle || row.raw_title || "").match(/\b(19|20)\d{2}\b/) || [])[0]) || 0;
    if (spec.blazerKind === "k5") {
      if (compact && !full) return "S-10 (compact), not the full-size K5";
      if (!(full || (y && y <= 1982))) return "not identifiably a full-size K5 Blazer";
    } else if (spec.blazerKind === "s10") {
      if (full && !compact) return "full-size, not the S-10 Blazer";
      if (!(compact || (y >= 1995 && y <= 2005))) return "not identifiably an S-10 Blazer";
    } else if (spec.blazerKind === "crossover") {
      if (!(y >= 2019)) return "not the 2019-on crossover Blazer";
    }
  }
  // Fix 4: a named TRIM must be the trim itself, not a PARTS or STYLE mention ("CSL wheels", "CSL
  // airbox", "CSL-style", "CSL replica"). A match where the trim token is immediately followed by a
  // part/style word (or tagged a replica/clone of it) is not that car.
  // The wider DB title pattern (trimIlike) is re-checked here: a row the old literal ILIKE matched
  // still passes; any other must match the code with real boundaries (no "XJ6 ... Sedan" for "XJ*S").
  // Trim contamination fix (Oct 2026): this used to check the LENIENT substring first and only
  // fall back to the strict word-boundary regex when the substring was absent entirely - backwards
  // for any trim whose literal text is a substring of the base model/other words ("S" inside
  // "Boxster", "Cayman", "Porsche", "6-Speed"...), since that substring is present in nearly every
  // title, so the strict check never ran and the "S" trim pooled the whole model (Boxster S/Cayman
  // S: confirmed 4-8% cross-model/cross-trim contamination). The strict regex is now AUTHORITATIVE
  // whenever trimTitleRe can build one; the substring check is a fallback ONLY for the rare trim
  // shape trimTitleRe cannot pattern (never the other way around).
  if (spec.titleContains) {
    const both = `${row.raw_title || ""} ${row.rtitle || ""}`;
    const tre = trimTitleRe(spec.titleContains);
    let hit = tre ? tre.test(both) : both.toLowerCase().includes(String(spec.titleContains).toLowerCase());
    if (hit) {
      const trimLc = String(spec.trim || "").toLowerCase();
      for (const q of COMPOUND_TRIM_QUALIFIERS) { if (q.test(both) && !q.test(trimLc)) { hit = false; break; } }
    }
    if (!hit) return "different variant (trim scope)";
  }
  const trimTok = spec.trim && String(spec.trim).trim().length >= 2 ? String(spec.trim).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : null;
  if (trimTok && new RegExp(`\\b${trimTok}[\\s\\-\\u2013\\u2014]*(wheels?|airbox|air\\s?box|trunk|boot|lip|spoiler|seats?|\\bkit\\b|bumper|badge|emblem|intake|exhaust|grille|style|look|replica|tribute|clone|wrap|decal|steering\\s?wheel|shift\\s?knob)\\b`, "i").test(title)) return "trim named as a part or style, not the car";
  // Performance-badge word boundary.
  if (spec.badgeRe && !spec.badgeRe.test(row.raw_title || row.rtitle || "")) return "wrong performance badge";
  // stock: reject a SUBSTANTIAL modification, plus egregious title markers.
  const mods = row.mods == null ? "" : String(row.mods);
  // e65 modified rule (Sam): a described change to the engine, the forced induction or the body; see modChangeTrigger
  if (modChangeTrigger(row, spec)) return "substantially modified";
  if (MOD_MARKERS.some(w => title.includes(w))) return "modified or non-stock";
  // variant/body discipline.
  if (spec.perfInclude) {
    if (!spec.perfInclude(title)) return "different variant (trim scope)";
  } else {
    if (spec.perfExclude && spec.perfExclude(title)) return "halo or other variant of the base car";
    // titleExclude (trim-fence fix, Oct 2026): the famSpec-surviving copy of the same check - fires
    // even when perfExclude itself has been cleared by the trim-to-family widening step.
    if (spec.titleExclude && spec.titleExclude(title)) return "halo or other variant of the base car";
    if (spec.excludeVariants && spec.excludeVariants.some(w => title.includes(w))) return "halo or other variant of the base car";
  }
  // Body discipline. A sale that names no body counts as the car's DEFAULT body for a COVERED model
  // (fix 3): a plain "S550" is a sedan, so it must not pass a Coupe filter - without this the S-Class
  // Coupe pool was 54/55 sedans. Covered models also read the maker's own body name (Ferrari GTS ->
  // targa) so a GTS can't sit in a Berlinetta(coupe) query.
  // When a TITLE-split family governs membership (familyInclude set: 812 Superfast/GTS/Competizione/
  // Competizione A, Cobra 289/427, ...), the variant already decides the pool and the stored body_style
  // (unreliable on BaT) is IGNORED for filtering - the family's body only sets the display label. The
  // body filter still applies to non-family cars where the variant does not determine the body
  // (911 coupe vs cabriolet, S-Class sedan vs coupe, Ferrari Berlinetta vs GTS/Spider).
  if (spec.bodyStyle && !spec.familyInclude) {
    const rule = mrRulesFor(spec.make, spec.model);
    // ONE CLASSIFIER, TITLE WORDS ONLY (Sam, Oct 15 2026, option 2): a typed body reads the same words the options and
    // the chips read (titleBodyOf, plus the model's own body names when they appear in the title: a Berlinetta is a
    // coupe). The stored body field contradicted the title on nearly half the Cars & Bids rows audited, so it cannot
    // decide the rows that have no title word to check it against; nor does a default body. A title that names no body
    // matches no typed body and stays "Body not stated" (its own option on the bare page). The stored field,
    // mrDefaultBody and the CLK DTM bare-coupe convention no longer fill a typed body here.
    const rowBody = rowBodyWordOf(row, rule);
    // e65 (the 2005 Ford GT read): a body set by a single-body LOCK (the model's rules allow one body for this generation or
    // trim) is not a typed body. A title that names no body is that one body, so it stays in; a title naming another body is out.
    // The lock had fenced every Ford GT sale out ("2005 Ford GT" names no body) and the answer read "not tracked".
    if (!rowBody && spec.bodyLocked) { /* the model's only body */ }
    else if (!rowBody) return "no body word in the title for the typed body";
    if (rowBody && bodyFamily(rowBody) !== bodyFamily(spec.bodyStyle)) return "different body style";
  }
  return null;
}
export function qualifyReason(row, spec) {
  if (!(Number(row.price) > 0)) return "no sale price";
  // $2,500 CAR FLOOR (Part 3): no real collector car sells for under $2,500. A sub-floor USD
  // figure is a part, a memorabilia lot, or a data error (a $600 belly pan, a $1,000 workshop
  // manual, a $265 oddment) leaking into the nameplate pool and surfacing as the displayed low.
  // Drop it from the pool entirely - counts, medians, span and cards all read above the floor.
  // Scoped to the USD compute value so a mixed-currency price never falsely trips it.
  if (hammerUsd(row) < DISPLAY_FLOOR) return "below the $2,500 car floor (part, memorabilia or data error, not a car)";
  // House-tier receipts are named sales, not photo cards (product RULE 1): a $48M 250 GTO house
  // sale is evidence even when OCD carries no featured image. Volume mode still requires a photo.
  if (!row.image && !spec.houseTier) return "no photo";
  // Every title/year-based membership rule (parts, memorabilia, prototype, race, project/incomplete,
  // model family, sub-trim, trim-as-part, badge, modified/replica/conversion markers, trim/halo scope,
  // body) lives in titleFenceReason - the SAME function the live-comparable panel calls (job 3).
  return titleFenceReason(row, spec);
}
export function isQualifying(row, spec) { return qualifyReason(row, spec) === null; }

// Drop PROJECT / incomplete / shell / non-original cars (item 1) from a bounded pool, reading the
// listing DESCRIPTION where the shell detail usually lives (an RM lot "unfinished ... engine of
// uncertain provenance") - the lean pool read does not carry it. Title-level is checked for free; only
// the survivors need a description, fetched in ONE id-keyed query (the house/thin pool is small). A
// flagged sale then never enters the pool, the range, the house ranking or the ask comparison.
async function filterProjectRows(rows, env) {
  if (!rows || !rows.length) return rows || [];
  const ttl = r => String(r.raw_title || r.rtitle || "");
  // Prefer the stored project_flag column: a row the column already flags is dropped without a
  // description fetch, and only rows with no column flag and no title flag need the live description.
  const flagged = r => r.project_flag || projectFlagReason(ttl(r), r._descText || null);
  // e59 (Sam's egress job): project_flag null means NOT FLAGGED on a stamped row (the backfill and the ingest stamp
  // write desc_facts on every row and a reason only on the ~4% that flag), so a row that carries desc_facts was already
  // read against the same rule at stamp time and needs no description fetch. Only an unstamped row (desc_facts null)
  // is read live. Before this, every unflagged thin-pool row was fetched on every search (265,561 calls).
  const needDesc = rows.filter(r => r.project_flag == null && r.desc_facts == null && !projectFlagReason(ttl(r), null) && r.id != null && r._descText == null);
  const ids = [...new Set(needDesc.map(r => r.id))];
  if (ids.length) {
    try {
      const drows = (await supabaseSelect(env, `sales_archive?id=in.(${ids.join(",")})&select=id,d:raw_record->>description`)) || [];
      const byId = {}; for (const dr of drows) byId[dr.id] = String(dr.d || "");
      for (const r of needDesc) if (byId[r.id] != null) r._descText = byId[r.id];
    } catch (e) { /* keep the title-only result on a desc-fetch failure */ }
  }
  return rows.filter(r => !flagged(r));
}

// ---- FIX 7: ARCHIVE TITLE-TOKEN RESOLUTION (Oct 2026) -----------------------------------------
// Resolve a typed nameplate that the resolver could not, by what the SALE TITLES say - but ONLY when
// the engine is about to show a clarification (never on a search that already resolves). Tries the
// full phrase first, then individual tokens; resolves ONLY when one make dominates the whole-word
// title matches (>=70% and >=5 sales) - otherwise returns null and the ask stands (condition 5: never
// guess). Cached per phrase (module map) so it never re-queries. Returns {make, model, ms, cached}.
const _tokCache = new Map();
const _reEsc = s => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export async function archiveResolveToken(phrases, env, queryTokens) {
  const qmakes = (queryTokens || []).map(mrNorm).filter(Boolean);
  for (const ph of (phrases || [])) {
    const key = mrNorm(ph);
    if (!key || key.length < 3) continue;
    if (_tokCache.has(key)) { const c = _tokCache.get(key); if (c) return { ...c, cached: true }; else continue; }
    const t0 = Date.now();
    let rows = null;
    try { rows = await supabaseSelect(env, `sales_archive?listing_title=ilike.${encodeURIComponent("*" + ph + "*")}&make=not.is.null&select=make,model,listing_title&limit=120`); } catch (e) { rows = null; }
    const ms = Date.now() - t0;
    if (rows === null) continue;   // query error: do not cache, do not resolve (keep the ask)
    const ww = new RegExp("\\b" + _reEsc(ph).replace(/\\?\s+/g, "\\s+") + "\\b", "i");
    // Exclude restomod/replica titles: "Singer" in a Porsche title is a restomod BUILDER, not the
    // car's identity, so a bare "Singer" must not resolve to Porsche-by-Singer cars (issue 2 guard).
    const hits = rows.filter(r => ww.test(String(r.listing_title || "")) && !/^unknown$/i.test(String(r.make || "")) && !/^reserve$/i.test(String(r.make || "")) && !restomodReason(String(r.listing_title || ""), r.make, r.model));
    const total = hits.length;
    if (total < 5) { _tokCache.set(key, null); continue; }
    const byMake = {}; for (const r of hits) { const mk = String(r.make).trim(); byMake[mk] = (byMake[mk] || 0) + 1; }
    const makeEntries = Object.entries(byMake).sort((a, b) => b[1] - a[1]);
    // Issue 1: when the user TYPED a make, scope to it FIRST and judge agreement within that make
    // ("Eagle Talon" -> make Eagle's titles agree on Talon, even though "Talon" is globally shared
    // with the Mitsubishi Galant). Otherwise require one make to dominate the whole set (>=70%).
    const typedMake = makeEntries.find(([mk]) => qmakes.includes(mrNorm(mk)));
    const chosen = typedMake || (makeEntries[0] && makeEntries[0][1] / total >= 0.7 ? makeEntries[0] : null);
    if (!chosen) { _tokCache.set(key, null); continue; }   // no clear agreement -> keep the ask
    const make = chosen[0];
    const makeHits = hits.filter(r => String(r.make).trim() === make);
    if (makeHits.length < 3) { _tokCache.set(key, null); continue; }
    // Within the chosen make, one model must clearly agree (>=60% of that make's hits), else keep ask.
    // Model: prefer the typed phrase if it is itself a model value among the hits, else the dominant
    // model-family for that make (never "Unknown").
    const models = {}; for (const r of hits) if (String(r.make).trim() === make) { const mo = String(r.model || "").trim(); if (mo && !/^unknown$/i.test(mo)) models[mo] = (models[mo] || 0) + 1; }
    // Prefer a model value that matches a distinctive TOKEN of the query ("240Z" over the dominant
    // "Z"), so the specific nameplate the seller typed wins over the broad family.
    const phToks = String(ph).split(/\s+/).filter(Boolean);
    const typed = Object.keys(models).find(m => phToks.some(t => mrNorm(t) === mrNorm(m))) || Object.keys(models).find(m => mrNorm(m) === mrNorm(ph));
    const topMo = Object.entries(models).sort((a, b) => b[1] - a[1])[0];
    // Condition 5 within the chosen make: resolve only when the seller's own token is a model value,
    // or one model clearly dominates that make's titles (>=60%). Else keep the ask (never guess).
    if (!typed && !(topMo && topMo[1] / makeHits.length >= 0.6)) { _tokCache.set(key, null); continue; }
    const model = typed || (topMo ? topMo[0] : null);
    if (!model) { _tokCache.set(key, null); continue; }
    const res = { make, model, ms };
    _tokCache.set(key, res);
    return { ...res, cached: false };
  }
  return null;
}

// ---- RULE 5 POOL GUARD (Part 1, Oct 2026) -----------------------------------------------------
// Model-boundary + year-gate + deny + restomod/replica guard, driven by lib/modelRules.js. A no-op
// for any model NOT in the rules table (fallback = today's behaviour, never a block). Returns the
// kept rows plus a classified removal/replica/no-year breakdown so the pool can be diffed and audited.
// This is the single highest-impact fix (Torino GT out of Ford GT, CL/CLS/SL out of S-Class, out-of-
// generation years out of every covered model) and runs BEFORE the pool is counted or ranged.
const _rowTitle = r => String((r && (r.raw_title || r.rtitle || r.title)) || "");
// TWO kinds of exclusion (Part 1 review, condition 1):
//  - REMOVED: a different car entirely (deny list = wrong model, year-gate = wrong era, no-year +
//    title mismatch). Gone from the page.
//  - TAGGED: the RIGHT model but a distorting variant (restomod/replica/tribute/continuation, and
//    the model's special editions: Heritage, Competition, CSL, track/race cars). KEPT on the page
//    and flagged (row._tag), shown under a "Shown separately" group, excluded from the headline
//    range. Never deleted. (GT40-style replicaSeparate routes replicas to their own `replica` pool,
//    which is the same "kept, shown separately, out of the range" treatment for a replica-heavy
//    nameplate.) The headline-range exclusion is applied downstream from the row._tag flag.
export function rule5PoolGuard(rows, spec) {
  const rule = mrRulesFor(spec && spec.make, spec && spec.model);
  if (!rule) return { kept: rows || [], removed: [], tagged: [], replica: [], noYearKept: 0, applied: false };
  const deny = mrDenyFor(spec.make, spec.model, { generationNamed: !!spec.genCode });
  const special = mrSpecialEditionRes(rule);   // the model's own special-edition regexes
  // When the QUERY asks for a special-edition trim (Turbo S, GT3 RS), THAT special is the pool - never
  // set it aside (bug 2: a "2005 911 Turbo S" emptied because "turbo s" is in specialEditions). Keep the
  // specials the resolved trim itself matches; OTHER specials (a GT3 in a Turbo S pool) still set aside.
  const asideSpecials = (spec && spec.trim) ? special.filter(re => !re.test(String(spec.trim))) : special;
  const modelTok = mrNorm(spec.model), famTok = mrNorm(rule.family);
  const poolTerms = (rule.poolTerms || []).map(mrNorm);
  const titleMatchesModel = nt => nt.includes(modelTok) || (famTok && nt.includes(famTok)) || poolTerms.some(t => t && nt.includes(t));
  // make-model adjacency ("Ford GT", not "Ford Ranchero GT"): used to tell a wrong-YEAR example of
  // THIS model (shown separately, year-mismatch note) from a different model that merely contains the
  // token (removed). Change 3.
  const esc = s => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const makeModelAdj = (spec.make && spec.model) ? new RegExp("\\b" + esc(spec.make).replace(/\\?-/g, "[\\s-]?") + "\\s+" + esc(spec.model) + "\\b", "i") : null;
  const kept = [], removed = [], tagged = [], replica = [], askable = [], yearMismatch = [];
  let noYearKept = 0;
  const tagRow = (r, reason, token) => { r._tag = token || reason; kept.push(r); tagged.push({ row: r, reason, token: token || reason }); };
  for (const r of (rows || [])) {
    const title = _rowTitle(r), nt = mrNorm(title);
    const yr = Number(r.year);
    // GT40-style: originals vs continuations/replicas are SEPARATE pools (kept, shown separately).
    if (rule.replicaSeparate) {
      const isRep = !!restomodReason(title, spec.make, spec.model)
        || (rule.replicaExtra || []).some(re => re.test(title))
        || (Number.isFinite(yr) && yr > 1969);
      if (isRep) { replica.push(r); continue; }
      if (Number.isFinite(yr) && !yearInRuleGenerations(rule, yr)) { removed.push({ row: r, reason: "year-gate" }); continue; }
      if (!Number.isFinite(yr) && !titleMatchesModel(nt)) { removed.push({ row: r, reason: "no-year" }); continue; }
      kept.push(r); if (!Number.isFinite(yr)) noYearKept++;
      continue;
    }
    // (1) DENY = a different model. Runs first so a cross-model edition collision ("GT40 Mk IV" in a
    //     Ford GT pool) is removed, not tagged as the Ford GT's own Mk IV.
    if (deny.some(re => re.test(title))) { removed.push({ row: r, reason: "deny" }); continue; }
    // (2) TAGGED = right model, distorting variant -> kept + flagged (restomod/replica/special edn).
    //     Checked BEFORE the year-gate so a track variant built outside the standard generations
    //     (Ford GT Mk II/Mk IV, 2023-24) is kept-and-tagged, never year-gated away.
    const rm = restomodReason(title, spec.make, spec.model);
    if (rm) { tagRow(r, "restomod", rm); continue; }
    // ASKABLE variant (Competition / ZCP, change 1): do NOT hard-tag. Keep it, flag r._askable, and
    // let the question gate decide - ask it when it is >25% of the pool and both sides have >=3,
    // else tag it out there. Marked here; the share test + ask/tag decision lives in the gate.
    const av = mrAskableVariant(title);
    if (av) { r._askable = av.label; kept.push(r); askable.push({ row: r, label: av.label }); continue; }
    if (asideSpecials.some(re => re.test(title))) { tagRow(r, "special-edition"); continue; }
    // (3) YEAR-GATE. A year outside the generations is either a wrong-YEAR example of THIS model
    //     (title names make+model adjacently -> shown SEPARATELY with a year-mismatch note, change 3)
    //     or a different model entirely (removed).
    if (Number.isFinite(yr)) {
      if (!yearInRuleGenerations(rule, yr)) {
        if (makeModelAdj && makeModelAdj.test(title)) { r._yearMismatch = yr; yearMismatch.push({ row: r, year: yr }); }
        else removed.push({ row: r, reason: "year-gate" });
        continue;
      }
    } else {
      // (4) no year: never a silent drop - keep only if the title clearly matches the model, count it.
      if (!titleMatchesModel(nt)) { removed.push({ row: r, reason: "no-year" }); continue; }
      noYearKept++;
    }
    kept.push(r);
  }
  return { kept, removed, tagged, replica, askable, yearMismatch, noYearKept, applied: true };
}

// ---- Deterministic comp-explanation engine (STEP 2) ----
// Rule-based, template-assembled from VERIFIED structured differences. Zero LLM calls,
// zero freeform inference. The pool is already variant/body/stock matched (isQualifying),
// so every comp is "same spec"; the explanation adds the honest differentiators.
function fmtMiles(n) { return Number(n).toLocaleString() + " miles"; }
function hasSignal(v) { const s = String(v == null ? "" : v).trim(); return !!s && s !== "[]" && s.toLowerCase() !== "null"; }
// Provenance signal from fields already present on house records. Never invents specifics:
// reports only the PRESENCE of documented history, not its contents.
function provenanceSignal(row) {
  if (hasSignal(row.ownership)) return "documented ownership history";
  if (hasSignal(row.service)) return "service history on file";
  return null;
}
function explainComp(row, subject, spec, sameSpec) {
  // Lead honestly: claim "Same spec" ONLY when the shown comps are the same variant. When
  // the variant within the resolved model is unknown/mixed, say what IS known and never
  // assert spec equality the match did not verify.
  const parts = [sameSpec ? "Same spec" : `${spec.subject || spec.model}, variant not stated`];
  const subjMiles = subject && Number.isFinite(Number(subject.mileage)) && Number(subject.mileage) > 0 ? Math.round(Number(subject.mileage)) : null;
  const mi = row.mi || {};
  if (subjMiles != null && mi.capable) {
    // Mileage delta ONLY when BOTH subject and comp have a usable odometer figure.
    const compMiles = mi.structured != null ? mi.structured : mi.stated;
    const d = compMiles - subjMiles;
    parts.push(Math.abs(d) < 1500 ? "similar mileage" : `${Math.abs(d).toLocaleString()} ${d < 0 ? "fewer" : "more"} miles`);
  } else if (mi.structured != null && subjMiles == null) {
    // Comp has real mileage but we can't compare (no subject mileage): state it plainly.
    parts.push(fmtMiles(mi.structured));
  } else if (mi.structured == null && mi.stated != null) {
    // Text-mined odometer: ALWAYS labeled as catalog-stated, never a bare structured fact.
    parts.push(`listed as approximately ${fmtMiles(mi.stated)}`);
  } else if (mi.structured == null) {
    // Mileage-blind comp (house record without usable mileage): NEVER imply a mileage
    // comparison; lean on provenance where the record carries it.
    const prov = provenanceSignal(row);
    if (prov) parts.push(prov);
  }
  parts.push(soldLabel(row.auction_end_date).replace(/^Sold /, "sold "));
  return parts.filter(Boolean).join(", ");
}

// !!! DEAD CODE (round-4 card model: relevanceLabels / analyzeSameSpec / labelCards / toCard).
// `labelCards` has NO caller - superseded by the round-7 pickRepresentative + shapeCards path. It
// carries a KNOWN UNFIXED divergence blind spot: it anchors "closest" on the subject's mileage
// with NO divergence check, so for an atypical (e.g. high-mileage) subject the closest comp lands
// OUTSIDE the cluster band - exactly the headline-vs-receipts bug fixed in pickRepresentative
// (Sep 2026). If you ever rewire a caller to this block, port that divergence guard FIRST.
// ---- Relevance-based card labels (STEP 1) ----
// Replace price-position labels (High/Middle/Low) with WHY each comp was selected
// relative to the subject, derived from the SAME comparison signals as the explanation:
// the closest spec+mileage match is "Closest match"; each other card is named by its
// actual differentiator (the mileage axis when both sides have a usable odometer, else
// recency). Rule-based, distinct labels, no freeform text.
function med(nums) { const a = nums.slice().sort((x, y) => x - y); const n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; }
function recencyLabel(c, anchor) {
  const cd = String(c.date || "").slice(0, 10), ad = String(anchor.date || "").slice(0, 10);
  if (cd && ad && cd > ad) return "More recent";
  if (cd && ad && cd < ad) return "Earlier sale";
  return "Comparable sale";
}
function relevanceLabels(cards, subject) {
  const subjMiles = subject && Number.isFinite(Number(subject.mileage)) && Number(subject.mileage) > 0 ? Number(subject.mileage) : null;
  const capable = cards.filter(c => Number.isFinite(c.mileage));
  // Reference for "closest": the subject's mileage if given, else the median mileage of
  // the mileage-capable cards. When neither exists (e.g. all house records without a
  // usable odometer), fall back to the median-VALUE card as the anchor.
  const ref = subjMiles != null ? subjMiles : (capable.length ? med(capable.map(c => c.mileage)) : null);
  const labels = new Array(cards.length).fill(null);
  let anchorIdx;
  if (ref != null && capable.length >= 1) {
    anchorIdx = cards.reduce((best, c, i) =>
      (Number.isFinite(c.mileage) && (best < 0 || Math.abs(c.mileage - ref) < Math.abs(cards[best].mileage - ref)) ? i : best), -1);
  } else {
    const byVal = cards.map((c, i) => [Number(c.value), i]).sort((a, b) => a[0] - b[0]);
    anchorIdx = byVal[Math.floor((byVal.length - 1) / 2)][1];
  }
  labels[anchorIdx] = "Closest match";
  const anchor = cards[anchorIdx];
  const base = subjMiles != null ? subjMiles : (Number.isFinite(anchor.mileage) ? anchor.mileage : null);
  for (let i = 0; i < cards.length; i++) {
    if (i === anchorIdx) continue;
    const c = cards[i];
    if (Number.isFinite(c.mileage) && base != null) {
      const d = c.mileage - base;
      labels[i] = Math.abs(d) < 1500 ? "Similar mileage" : (d < 0 ? "Lower mileage" : "Higher mileage");
    } else {
      labels[i] = recencyLabel(c, anchor);   // not mileage-driven -> recency axis
    }
  }
  return labels;
}
// Same-spec establishment (WS1.1). We can't verify sub-variant equality from the archive
// deterministically (titles are noisy), so the normalized-value SPREAD of the shown comps
// is the confidence signal for a "same spec" claim: a wide spread among one nameplate is
// almost always variant mixing (base F430 vs a likely-Scuderia) or a market too loose to
// call one spec. Tight -> claim same-spec; medium -> render but never assert equality
// ("variant not stated"); wide -> REFUSE and ask for the trim. Computed on USD hammer, so
// mixed currency never distorts it.
const SAME_SPEC_TIGHT = 1.8;    // <=1.8x normalized spread -> confidently same-spec
const REFUSE_SPREAD = 2.5;      // >2.5x -> not one market; ask for the trim/engine
function analyzeSameSpec(cards) {
  const vals = cards.map(c => Number(c.value)).filter(Number.isFinite);
  const spread = vals.length ? Math.max(...vals) / Math.max(1, Math.min(...vals)) : 1;
  return { sameSpec: spread <= SAME_SPEC_TIGHT, spread, refuse: spread > REFUSE_SPREAD };
}
// Build the selected cards, then stamp relevance labels + the "closest" flag (drives the
// card highlight) and the same-spec-aware explanation. Returns { cards, refuse }.
function labelCards(rows, spec, subject) {
  const cards = rows.map(r => toCard(r, "", spec, subject));
  const { sameSpec, refuse } = analyzeSameSpec(cards);
  const labels = relevanceLabels(cards, subject);
  cards.forEach((c, i) => {
    c.rank = labels[i];
    c.closest = labels[i] === "Closest match";
    c.explanation = explainComp(rows[i], subject, spec, sameSpec);
  });
  return { cards, refuse };
}

function toCard(row, rank, spec, subject) {
  const mi = row.mi || mileageInfo(row);
  const disp = priceDisplay(row);
  // USD-equivalent of the DISPLAYED native price (WS1.2): a small "≈ $X" anchor so a
  // mixed-currency result is readable at a glance. Only for non-USD cards.
  const usdApprox = disp.currency !== "USD" && disp.amount != null ? Math.round(toUsd(disp.amount, disp.currency, row.date || row.sale_date || row.auction_end_date || null)) : null;
  return {
    rank,
    display: disp,                              // { amount, currency, premiumInclusive } - shown as-is
    usdApprox,                                  // number | null -> renders "≈ $X" under a non-USD price
    value: Math.round(Number(row.value)),       // USD implied hammer - the COMPUTE basis, never the headline
    spec: spec.cardSpec,
    soldLabel: soldLabel(row.auction_end_date),
    date: row.auction_end_date || null,
    platform: platformName(row.source),
    isHouse: isHouseSource(row.source),
    image: row.image || null,
    year: spec.year || null, make: spec.make, subjectName: spec.subject, // photo-fallback plate
    mileage: mi.structured,                      // structured odometer (null renders TMU)
    mileageStated: mi.structured == null ? mi.stated : null, // catalog-stated, labeled
    mileageCapable: !!mi.capable,
    explanation: ""                              // set after the same-spec decision (see labelCards)
  };
}

// Body-style buckets (targa/cabriolet/convertible/roadster checked before coupe so a
// "Targa Coupe" title reads as Targa). Chips offered dynamically from what's present.
const BODY_BUCKETS = [
  { style: "targa", label: "Targa", words: ["targa"] },
  { style: "cabriolet", label: "Cabriolet", words: ["cabriolet", "cabrio"] },
  { style: "convertible", label: "Convertible", words: ["convertible", "drophead", "dhc"] },
  { style: "roadster", label: "Roadster", words: ["roadster", "spyder", "spider"] },
  // Fastback (e41, Sam's Job 1): on a pre-1990 car the fastback is its own body (a 1965 Mustang 2+2 is not the
  // notchback coupe); from 1990 on "Fastback" is a maker's word for the coupe (the S550 Mustang) and reads coupe.
  { style: "fastback", label: "Fastback", words: ["fastback"] },
  { style: "coupe", label: "Coupe", words: ["coupe", "coupé", "berlinetta", "hardtop", "notchback", "gullwing"] },
  { style: "sedan", label: "Sedan", words: ["sedan", "saloon", "berlina"] }
];
function bodyFromText(text) {
  const t = String(text || "").toLowerCase();
  for (const b of BODY_BUCKETS) if (b.words.some(w => t.includes(w))) return b.style;
  return null;
}
// classifyBody (rule rewritten, Lane B, Oct 15 2026, Sam's Job 1b: the stored body_style is not a fact):
//   1. the body the LISTING'S OWN TITLE names wins ("2011 BMW M3 Convertible" is a convertible whatever the
//      stored field says);
//   2. a title that names no body falls to the stored body_style ONLY when the model's own facts offer that
//      body for the car's model year (lib/modelRules.js bodiesForYear: a G80 M3 is sedan only, so a stored
//      "Convertible" on a 2023 M3 is not accepted); a stored body the generation never offered is ignored,
//      and the caller's existing default-body rule (defaultBodyFor) decides, as it already did for a bare
//      title with no stored body;
//   3. an uncovered model (no rule) keeps the stored body as before.
// Why: Cars & Bids stores body_style wrongly on a large share of its rows (audit, BMW M3 since Jan 2025:
// 69 of 160 titled rows carry a stored body that contradicts the title's own word, Sedan and Convertible
// swapped), and the old order (stored field before title) read every such row as a different body.
// A modern "Fastback" (1990 on) is the coupe; before that it is its own body. Applied to the title word and
// the stored word alike, so every reader of a row's body agrees (options, the refine filter, the discipline).
function modernFastback(style, year) { return style === "fastback" && Number(year) >= 1990 ? "coupe" : style; }
function titleBodyOf(row) { return modernFastback(bodyFromText(String(row.rtitle || row.raw_title || "")), row.year); }
// rowBodyWordOf (e58): THE one reader of a row's body for a typed or chip body - the title's body word, else the model's
// own body names when they appear in the title (a Berlinetta is a coupe, a Spider is open). Title words only: no stored
// field, no default body. Used by qualifyReason's typed-body fence and buildPool's body refine, so a chip count, its
// page and the typed body always read the same rows.
function rowBodyWordOf(row, rule) {
  const tb = titleBodyOf(row); if (tb) return tb;
  if (rule && rule.bodyNames) {
    const t = String(row.rtitle || row.raw_title || "");
    for (const [fam, label] of Object.entries(rule.bodyNames)) { if (new RegExp("\\b" + String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(t)) return fam; }
  }
  return null;
}
function classifyBody(row, rule) {
  const titleBody = titleBodyOf(row);
  if (titleBody) return titleBody;
  const stored = modernFastback(bodyFromText(String(row.body || "")), row.year);
  if (!stored) return null;
  if (rule) {
    const offered = bodiesForYear(rule, row.year);
    if (offered && offered.length) return offered.some(b => bodyFamily(bodyFromText(b) || b) === bodyFamily(stored)) ? stored : null;
  }
  return stored;
}
// cabriolet / convertible / roadster are one open-top family; coupe and targa stand alone.
function bodyFamily(style) { return style === "targa" ? "targa" : style === "coupe" ? "coupe" : style === "sedan" ? "sedan" : style === "fastback" ? "fastback" : style === "wagon" ? "wagon" : "open"; }
// Statistical outlier guard: a rare high-value variant (L88, Shelby, big-block) must
// not anchor a card. Drop candidates a gross multiple off the median; if the core is
// still implausibly spread, the query is underspecified (there is no clean discrete
// choice to offer, so a threshold is the mechanism).
const OUTLIER_HIGH = 4, OUTLIER_LOW = 0.2, IMPLAUSIBLE_SPREAD = 6;
// Median of the NORMALIZED compute value (USD implied hammer), never raw display price,
// so a premium-inclusive house price never distorts the guard or the pooled midpoint.
function medianPrice(sortedAsc) {
  const p = sortedAsc.map(r => Number(r.value));
  const n = p.length;
  return n % 2 ? p[(n - 1) / 2] : (p[n / 2 - 1] + p[n / 2]) / 2;
}
// Comparison-field richness for the tie-break: at equal value, the record with more
// populated comparison fields (usable mileage first) wins the slot, so a mileage-blind
// comp never beats a mileage-matched one on equal footing.
function compRich(r) {
  const mi = r.mi || {};
  return (mi.capable ? 4 : 0) + (mi.structured != null ? 2 : 0) + (hasSignal(r.ownership) || hasSignal(r.service) ? 1 : 0);
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function joinList(a) { return a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
function bodyPrompt(labels) { return `These sold as ${joinList(labels)}, and they price differently. Which one is it?`; }
// LABEL TRUTHFULNESS (Lane B job, Oct 2026, Part 2): two small, reusable facts every rungLabel site
// below mixes in, never invented, read straight off the rows the label is actually describing.
const LABEL_BODY_PLURAL = { targa: "targas", cabriolet: "cabriolets", convertible: "convertibles", roadster: "roadsters", coupe: "coupes", sedan: "sedans" };
// Rule (b): when the query named no body style and the pool holds more than one, say so plainly
// ("2025 911, coupes and cabriolets") - never let a mixed-body pool read as if every sale were one.
function bodyMixSuffix(spec, rows) {
  if (spec.bodyStyle || !Array.isArray(rows) || !rows.length) return "";
  // Grouped by FAMILY (bodyFamily: cabriolet/convertible/roadster are one open-top family), not raw
  // style - two listings of the SAME real open-top car described as "Cabriolet" on one and
  // "Convertible" on another must never read as two different body styles in the pool (confirmed
  // live, "2005 Mercedes-Benz CLK DTM" - a genuine coupe+cabriolet mix - first read "Cabriolets,
  // convertibles and coupes", double-counting the one open-top family). The most frequent raw style
  // within a family names that family's plural.
  const famCounts = {};
  // TITLE WORDS ONLY (e41, Sam's Job 3b): a body named in the scope line must be a body the listings themselves
  // name; the stored body_style field never puts a body word in a label ("2006 M5, sedans and convertibles" came
  // from stored fields on a car that was never a convertible).
  for (const r of rows) { const b = titleBodyOf(r); if (!b) continue; const fam = bodyFamily(b); (famCounts[fam] = famCounts[fam] || {})[b] = (famCounts[fam][b] || 0) + 1; }
  // LABEL ORDER (Lane B job, Oct 2026, Part 5): the body with the most sales first, then the rest in
  // descending count - a fixed, deterministic order every reader can expect, never insertion order
  // (which is whichever body this pool's FIRST row happened to be).
  const famTotal = fam => Object.values(famCounts[fam]).reduce((a, c) => a + c, 0);
  const fams = Object.keys(famCounts).sort((a, b) => famTotal(b) - famTotal(a));
  if (fams.length < 2) return "";
  const labels = fams.map(fam => { const best = Object.entries(famCounts[fam]).sort((a, b) => b[1] - a[1])[0][0]; return LABEL_BODY_PLURAL[best] || best + "s"; });
  return ", " + joinList(labels);
}
// Rule (a): the real year span of the rows behind a widened answer, or null when every row is the
// one asked year (nothing to widen-label) or no rows carry a year at all.
function poolYearSpan(rows) {
  const ys = (Array.isArray(rows) ? rows : []).map(r => Number(r.year)).filter(Number.isFinite);
  if (!ys.length) return null;
  const lo = Math.min(...ys), hi = Math.max(...ys);
  return lo === hi ? null : [lo, hi];
}

// (Re)compute the display labels from the current scope + resolved bodyStyle. The
// nameplate ALWAYS carries the model (never a bare trim like "M").
function relabel(spec) {
  const name = nameplate(spec.model, spec.trim);
  const subject = [name, spec.bodyStyle ? cap(spec.bodyStyle) : ""].filter(Boolean).join(" ");
  spec.subject = subject;
  // Dedupe the generation token when the subject ALREADY carries it: a chassis-code model ("997",
  // "991", "964") IS its own generation code, so "997 997 Carrera S Coupes" / "997 Carrera S, 997"
  // read the code twice. Only prepend/append genCode when the subject does not already start with it
  // (a nameplate query like "911" with genCode "997" still reads "997 911 Carrera S", informative).
  const genTok = spec.genCode ? String(spec.genCode) : "";
  const subjHasGen = !!genTok && new RegExp("^" + genTok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(subject);
  const genPfx = genTok && !subjHasGen ? genTok + " " : "";
  spec.cardSpec = [subject, subjHasGen ? "" : spec.genCode].filter(Boolean).join(", ");
  const youText = [spec.year, name].filter(Boolean).join(" ");
  if (spec.yearMin && spec.yearMax && spec.genCode) spec.resolvedSpec = `Comparing the ${youText} with equivalent ${spec.yearMin} to ${spec.yearMax} ${genPfx}${subject}s.`;
  else if (spec.yearMin && spec.yearMax) spec.resolvedSpec = `Comparing the ${youText} with equivalent ${spec.yearMin} to ${spec.yearMax} ${subject} sales.`;
  else spec.resolvedSpec = `Comparing the ${youText} with equivalent ${subject} sales.`;
  return spec;
}

// Resolve the comparison scope from the resolved vehicle and generation.
// Buyer-spoken generation nicknames that are not the archive's own chassis-code text (unlike NA/NB/NC/
// ND, C1-C8, FD, S13/S14/S15, R32/R33/R34, which already bind because the nickname IS the curated code).
// Mapped to the real code here, early, so the SAME code-equals-trim mechanism (below) picks them up.
const GEN_NICKNAME_TO_CODE = {
  "toyota|supra": { mk1: "A40", mk2: "A60", mk3: "A70", mk4: "A80", mk5: "A90" }
};
export function buildSpec(vehicle, generation, searchText) {
  const spec = {
    make: vehicle.make || "", model: vehicle.model || "", trim: vehicle.trim || "", year: Number(vehicle.year) || null,
    // One parser only (Oct 2026 follow-up): bodyStyle comes from resolveVehicle alone, never a second,
    // independent rescan of the raw search text. The old chain (detectBodyStyle(searchText) first)
    // let Market Check "see" a body word resolveVehicle itself had dropped ("1988 Porsche 911
    // Carrera Targa" - resolveVehicle lost Targa, but detectBodyStyle(searchText) still found it in
    // the raw text), which is exactly how Market Check silently survived the Carrera+Targa resolver
    // bug while Buy/Sell/Tasks (which only ever read vehicle.bodyStyle) did not. Now that resolveVehicle
    // itself carries the body style for that case (refine911), every lane reads the identical field.
    bodyStyle: vehicle.bodyStyle || null
  };
  { const nm = GEN_NICKNAME_TO_CODE[`${spec.make.toLowerCase().trim()}|${spec.model.toLowerCase().trim()}`]; const code = nm && nm[spec.trim.toLowerCase().trim()]; if (code) spec.trim = code; }
  // DEFENDER 90/110/130 (Lane B job, Oct 2026, Part 2 rule d; re-fixed Part 3 golden-cars job): a
  // variant dimension of its own, not a trim or a body. vehicle.wheelbase IS a real resolver field
  // (lib/vehicle.js, lib/marketSpec.js detectSearchSpec) - read it FIRST, since it survives every
  // path (Buy/Sell/Tasks, the ops enginecheck/obdiag tasks), unlike searchText which only Market
  // Check's page path assembles with the full raw query. The old code read searchText exclusively,
  // so any caller that resolved the vehicle without also carrying the identical raw text (every
  // path but Market Check's page) pooled 90/110/130 together: confirmed live, the resolver's
  // wheelbase was right while the shared engine answer was not. Text-scan kept ONLY as a fallback
  // for a caller that never resolved wheelbase at all. Only when no real trim was already resolved,
  // so a genuinely curated Defender trim never gets clobbered by this.
  if (!spec.trim && /land\s*rover/i.test(spec.make) && /defender/i.test(spec.model)) {
    const wb = /^(90|110|130)$/.test(String(vehicle.wheelbase || "")) ? String(vehicle.wheelbase) : null;
    const m = wb ? null : /\b(90|110|130)\b/.exec(String(searchText || ""));
    if (wb) spec.trim = wb; else if (m) spec.trim = m[1];
  }
  // base-variant exclusions: if the seller did NOT ask for a Turbo/GT car, a Turbo in
  // the same years is a different market (the outlier guard catches the rest).
  const wantTurbo = /turbo/i.test(searchText || "") || /turbo/i.test(spec.trim);
  spec.excludeVariants = wantTurbo ? [] : ["turbo", " gt2", " gt3", "gt3", "gt2", "speedster", "anniversary", " rs "];
  // Performance-trim scoping. If the seller named the trim, scope the pool TO it; if
  // not, exclude the make's halo from the base pool so it never mixes in (an RS guard
  // keeps a plain "GT3" query from pulling in the GT3 RS).
  spec.perfInclude = null; spec.perfExclude = null;
  const perf = PERF_TRIMS.find(p => p.make.test(spec.make));
  if (perf) {
    if (perf.activate.test(spec.trim || "")) {
      const re = perf.include(spec.model, spec.trim || "");
      const rsGuard = /\brs\b/i.test(spec.trim || "") ? null : /\brs\b/i;
      spec.perfInclude = title => re.test(title) && !COSMETIC_TRIM.test(title) && !(rsGuard && rsGuard.test(title));
    } else {
      const bx = perf.baseExclude(spec.model);
      // Do NOT strip the halo token from a model whose NAME intrinsically carries it: an
      // "SLS AMG" (or "SLR ...") IS the AMG, so a baseExclude of /\bamg\b/ empties its own
      // pool (every SLS AMG title has "AMG"), which surfaced as a false "no sales" refusal.
      // The model ILIKE already scopes the pool to this car; the exclusion is only meant to
      // drop halo variants from a TRUE base query (SL-Class, C-Class) whose model name lacks
      // the token. BMW already guards this (baseExclude null for M-cars); Mercedes did not.
      // Shared intrinsicAmgFor also catches R232 SL-Class 2022+ (URGENT, Oct 2026, SL-Class
      // class-era leak root cause #2): see its own comment for why that generation needs this
      // too even though "SL-Class" itself does not say "amg".
      if (bx && !intrinsicAmgFor(spec.make, spec.model, spec.year) && !bx.test(spec.model || "")) spec.perfExclude = title => bx.test(title);
    }
  }
  // titleExclude (trim-fence fix, Oct 2026): a SEPARATE copy of the same baseExclude test, used only
  // because perfExclude itself does not survive runOneBox's famSpec widening step ({...spec,
  // perfInclude: null, perfExclude: null, excludeVariants: []}) - a base query's halo exclusion
  // (Shelby/GT350/GT500/Boss/SVT out of a base Mustang, Z06/ZR1/ZL1/Z28 out of a base Corvette/
  // Camaro) was silently never reaching the real fetch, the same class of gap the uncurated-trim
  // fence fixed for perfInclude. titleExclude is NOT cleared by famSpec (see the three famSpec
  // definitions below, which deliberately omit it) and is checked in qualifyReason the same way
  // perfExclude is.
  if (spec.perfExclude) spec.titleExclude = spec.perfExclude;
  // VARIANT MARKET (Sam's Job 4, Oct 15 2026): the nameplate's separate-market variant table entry, read by
  // the variant block in runOneBox and by buildPool's refine.variant. variantAsked: the typed words name
  // the variant itself, so the pool IS the variant and no question or set-aside applies.
  spec.variantMarkets = variantMarketsFor(spec.make, spec.model, spec.trim);
  spec.variantMarket = variantMarketFor(spec.make, spec.model, spec.trim) || null;
  spec.variantAsked = !!(spec.variantMarket && spec.variantMarket.re.test([spec.trim, searchText].filter(Boolean).join(" ")));
  // askedVariantKeys: the entries the typed words name themselves (no question, no set-aside for those).
  spec.askedVariantKeys = spec.variantMarkets.filter(v => v.re.test([spec.trim, searchText].filter(Boolean).join(" "))).map(v => v.key);
  // A badged family's generation map is family-level (all SLs), so it mismatches a
  // specific badge's own production years (a Pagoda 280SL is not the R107 window). For
  // those, anchor on the seller's year (+/-2) instead of the family generation.
  const badgedFamily = !!familyFor(spec.make, spec.model);
  // SPLIT-YEAR guard (Sep 2026): a handover year that falls in >=2 curated generations (a 1994 911
  // is both 964 and 993 by the deliberate overlap) must NOT auto-bind - leave genCode/year bounds
  // UNSET so the generation clarify fires and the seller disambiguates. The passed `generation`
  // (findGeneration = first match) and the badged re-bind below would both otherwise silently pick
  // one; this takes precedence over both.
  const splitYear = !!(spec.year && generationsForModel(spec.make, spec.model).filter(g => spec.year >= g.yearStart && spec.year <= g.yearEnd).length >= 2);
  if (splitYear) { spec.yearMin = null; spec.yearMax = null; spec.genCode = null; }
  else if (!badgedFamily && generation && generation.yearStart && generation.yearEnd) { spec.yearMin = generation.yearStart; spec.yearMax = generation.yearEnd; spec.genCode = generation.code || null; }
  else if (spec.year) { spec.yearMin = spec.year - 2; spec.yearMax = spec.year + 2; spec.genCode = null; }
  else { spec.yearMin = null; spec.yearMax = null; spec.genCode = null; }
  // Chassis-code model with no year ("991 GT3 RS", "997 Carrera S"): the CODE names the
  // generation, so bound the pool to that generation's production years even without a year.
  // Only for a model whose curated generations are tight (<=3), so a bare multi-generation
  // nameplate (911, M3) is untouched (it clarifies generation or refuses instead).
  if (!spec.yearMin && !spec.yearMax) {
    const gens = generationsForModel(spec.make, spec.model);
    if (gens.length && gens.length <= 3) { spec.yearMin = Math.min(...gens.map(g => g.yearStart)); spec.yearMax = Math.max(...gens.map(g => g.yearEnd)); }
  }
  // CHEVROLET BLAZER family routing: three different vehicles under one nameplate - full-size K5
  // (1969-1994), compact S-10 (1983-2005), 2019+ crossover. Route by typed model, then year, then
  // title clues; set spec.blazerKind so archiveScope fetches all "Blazer" titles broadly and
  // qualifyReason keeps only this kind. A trim-less bare "Blazer" in the 1983-1994 overlap with no
  // clue is genuinely ambiguous -> spec.blazerAsk (runOneBox asks K5 vs S-10, never guesses).
  if (/^chevrolet$/i.test(String(spec.make || "").trim()) && /^(k5\s+blazer|s-?10\s+blazer|blazer)$/i.test(String(spec.model || "").trim())) {
    const mdl = String(spec.model).toLowerCase();
    const txt = [searchText, vehicle.raw, vehicle.canonicalLabel].filter(Boolean).join(" ");
    const y = spec.year;
    let kind = /k5/.test(mdl) ? "k5" : /s-?10/.test(mdl) ? "s10" : null;
    if (!kind) {
      if (y && y >= 2019) kind = "crossover";
      else if (y && y < 1983) kind = "k5";
      else if (y && y >= 1995 && y <= 2005) kind = "s10";
      else if (BLAZER_FULL_RE.test(txt) && !BLAZER_COMPACT_RE.test(txt)) kind = "k5";
      else if (BLAZER_COMPACT_RE.test(txt) && !BLAZER_FULL_RE.test(txt)) kind = "s10";
      else kind = "ask";
    }
    if (kind === "ask") { spec.blazerAsk = true; }
    else {
      spec.blazerKind = kind;
      spec.model = kind === "k5" ? "K5 Blazer" : kind === "s10" ? "S-10 Blazer" : "Blazer";
      spec.excludeVariants = [];   // kind-filter governs membership, not the generic halo list
      // A truck code the resolver parsed as a trim (D10/K10/K1500/C20) is a KIND signal, not a trim;
      // leaving it on would over-scope the pool to that one code (a "Blazer D10" query -> 0 cards).
      if (/^[cdk]-?\d{2,4}$/i.test(String(spec.trim || "").trim())) spec.trim = "";
      if (kind === "k5") {
        const kg = generationsForModel("Chevrolet", "K5 Blazer");
        const g = spec.year ? kg.find(x => spec.year >= x.yearStart && spec.year <= x.yearEnd) : null;
        if (g) { spec.yearMin = g.yearStart; spec.yearMax = g.yearEnd; spec.genCode = g.code; spec.genBound = true; spec.genPinnedByYear = !!spec.year; }
        else if (!spec.year) { spec.yearMin = 1969; spec.yearMax = 1991; }
      } else if (kind === "crossover") { spec.yearMin = Math.max(2019, spec.yearMin || 0) || 2019; spec.yearMax = spec.yearMax && spec.yearMax >= 2019 ? spec.yearMax : null; }
    }
  }
  // Performance-badge normalization (M/AMG/RS): scope on the badge in the TITLE, and make the
  // MODEL the badge so the label + ladder read "M4 Competition", never the filed "4-Series".
  // The generation/year window computed above still applies (an F82 M4 stays 2015-2020 range).
  const pb = performanceBadge(spec.make, spec.model, spec.trim, [searchText, vehicle.raw, vehicle.canonicalLabel, vehicle.displayName, vehicle.matchTitle].filter(Boolean).join(" "));
  if (pb) { spec.badge = pb.badge; spec.badgeRe = pb.re; spec.model = pb.badge; spec.trim = pb.variant; spec.perfInclude = null; spec.perfExclude = null; spec.titleExclude = null; spec.excludeVariants = []; }
  // GENERATION RE-BIND on the normalized badge model (Sep 2026 fix): a performance badge (M4,
  // M3, M5) has its OWN curated generations, and the seller's year selects one. findGeneration
  // ran on the FILED model upstream (often "4-Series"/"3-Series"), so it can miss the badge
  // model's mapping and leave a year+/-2 window that STRADDLES a generation boundary - a 2019 M4
  // +/-2 pulls in 2021 G82s as "closest match". Re-bind here, on spec.model=badge, so the pool
  // stays within the seller's actual generation. Only fires when a curated generation fits the
  // year; otherwise the earlier window stands.
  if (spec.year) {
    // A Mercedes AMG badge ("S65", "C63") is scoped by the badge but its GENERATIONS are curated at
    // the family level ("S-Class"), so look those up under the family (badge alpha-prefix + "-Class")
    // when the badge itself has none - otherwise a 2006 S65 (W220) falls to year+/-2 and pools 2008
    // W221 cars. Non-Mercedes and non-badge models use the model directly.
    let genModel = spec.model;
    if (/mercedes|benz/i.test(spec.make) && !generationsForModel(spec.make, spec.model).length) {
      const pfx = String(spec.model || "").match(/^([A-Za-z]{1,3})\s?\d{2}\b/);
      if (pfx) genModel = pfx[1].toUpperCase() + "-Class";
    }
    const matching = generationsForModel(spec.make, genModel).filter(g => spec.year >= g.yearStart && spec.year <= g.yearEnd);
    // Auto-bind ONLY when the year lands in exactly ONE generation. A split/handover year (a 1994
    // 911 is both 964 and 993 by the deliberate overlap in generations.js) leaves genCode UNSET so
    // the generation clarify fires and the seller disambiguates, instead of silently binding 964.
    if (matching.length === 1) { const bg = matching[0]; spec.yearMin = bg.yearStart; spec.yearMax = bg.yearEnd; spec.genCode = bg.code; }
  }
  // BARE GENERATION/CHASSIS CODE in the query (item 4, Sep 2026): "E46 M3", "964 Carrera", "W220 S65"
  // name the generation directly, so bind that generation's production window + genCode even with no
  // typed year - and, because genCode is now set, the generation clarify is skipped and the pool
  // scopes to the code's years. Only when EXACTLY ONE curated generation code for this model appears
  // in the query text (an ambiguous or absent code leaves the earlier window untouched).
  if (!spec.genCode) {
    const gens = generationsForModel(spec.make, spec.model);
    if (gens.length) {
      const hay = [searchText, vehicle.raw, vehicle.canonicalLabel, spec.trim].filter(Boolean).join(" ");
      const hit = gens.filter(g => new RegExp(`\\b${String(g.code).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay));
      if (hit.length === 1) { spec.yearMin = hit[0].yearStart; spec.yearMax = hit[0].yearEnd; spec.genCode = hit[0].code; }
    }
  }
  // Race/road trim-family fence (item 2) on the general result path: a named race trim (GT2 R) scopes
  // the perf-include to its family (GT2 R + GT2 Evo); a road badge (GT2) drops its race siblings. The
  // fence AUGMENTS perfInclude (it never relaxes it): a road GT2's perfInclude still requires "GT2".
  spec.trimFence = trimFamilyFence(spec.make, spec.model, spec.trim) || null;
  if (spec.trimFence) {
    const base = spec.perfInclude;
    if (spec.trimFence.onlyRe) spec.perfInclude = t => (base ? base(t) : true) && spec.trimFence.onlyRe.test(normalizeTitleForTrim(t));
    else if (spec.trimFence.excludeRe) spec.perfInclude = t => (base ? base(t) : true) && !spec.trimFence.excludeRe.test(normalizeTitleForTrim(t));
  }
  // MODEL FAMILIES (item 2/3): a nameplate split by displacement/series (Shelby Cobra 289 / 427 /
  // Daytona / continuation) that are never one market. Scope the pool to the family the query names;
  // when none is named the query is AMBIGUOUS and runOneBox asks (never pools every family).
  const famGroup = modelFamilyGroup(spec.make, spec.model);
  if (famGroup) {
    // Scope byModel to the family BASE ("812") so every variant pools the whole family (BaT files
    // all 812s as model "812"); the family title filter then isolates the variant. Without this a
    // variant whose resolver produced a variant-specific model ("812 Superfast") under-fetched.
    if (famGroup.base) spec.model = famGroup.base;
    const fr = familyForText(spec.make, spec.model, [searchText, vehicle.raw, vehicle.canonicalLabel, vehicle.displayName, vehicle.matchTitle, spec.trim].filter(Boolean).join(" "));
    if (fr && fr.family) {
      spec.familyInclude = fr.family.include;
      spec.familyExclude = fr.family.exclude || null;
      spec.familyName = fr.family.name;
      spec.familyLabel = fr.family.label;
      if (!spec.trim || !fr.family.include.test(spec.trim)) spec.trim = fr.family.chip;   // label reads "Shelby Cobra 427"
      // Body from the variant (Fix 3): a family may carry its body (812 GTS/Competizione A are
      // convertibles, Superfast/Competizione coupes). Apply only when the query did not state a body
      // itself, so the pool scopes to the variant's real body instead of the model's default coupe.
      if (fr.family.body && !spec.bodyStyle) spec.bodyStyle = fr.family.body;
    } else if (fr && fr.ambiguous) {
      spec.familyAmbiguous = true;
    }
  }
  // SUB-TRIM FENCE (bug 2): a named base/sub trim scopes the pool to itself (title-based), so a base
  // "911 Carrera" never pools a Carrera S/T/GTS. Applied as a title include/exclude in qualifyReason.
  const stf = subTrimFenceFor(spec.make, spec.model, spec.trim);
  if (stf) { spec.subTrimInclude = stf.include; spec.subTrimExclude = stf.exclude || null; spec.subTrimName = stf.name; spec.subTrimNoManualBase = stf.noManualBase; }
  // HALF-GENERATION (Oct 2026, half-generation job): lib/generations.js's ONE shared table, never
  // a per-model branch. halfGenOwnHalf is set whenever the seller's own year pins exactly one half,
  // REGARDLESS of whether this model splits - a merged model (997, E46 M3) still needs to know the
  // car's own half so pickRepresentative can prefer same-half context cards even though the window
  // itself stays merged. Only a model with split:true actually narrows spec.yearMin/yearMax/genCode
  // here, and only when a year pins a half - a bare, year-less search ("Porsche Boxster") is
  // UNCHANGED (today's merged window stands); halfGenAvailable still reports the split exists, so
  // the evidence note can say so plainly instead of silently choosing a half.
  spec.halfGenAvailable = null; spec.halfGenOwnHalf = null; spec.halfGenSplit = null;
  {
    const hg = halfGenerationFor(spec.make, spec.model);
    if (hg) {
      spec.halfGenAvailable = { parentCode: hg.parentCode, split: hg.split, halves: hg.halves.map(h => h.code) };
      const half = halfForYear(hg, spec.year);
      if (half) {
        spec.halfGenOwnHalf = half.code;
        if (hg.split) { spec.yearMin = half.yearStart; spec.yearMax = half.yearEnd; spec.genCode = half.code; spec.halfGenSplit = half.code; }
      }
    }
  }
  // GENERATION NICKNAME, not a literal trim word (MK4, NA/NB/NC/ND, C1-C8, FD, S13/S14/S15, R32/R33/
  // R34): once it has done its job binding spec.genCode (and the year window with it), the nickname
  // text itself is never printed in a listing title ("1958 Chevrolet Corvette" never says "C1"). Left
  // in spec.trim, it becomes a literal title-match requirement downstream (assessThin's trimRe) that
  // zeroes the pool even though the year window alone already scopes it correctly. Clear it whenever
  // the final genCode equals the trim text (case-insensitive) - the signal that the trim slot is
  // carrying the generation code, not a real trim.
  if (spec.genCode && spec.trim && String(spec.genCode).toLowerCase().trim() === String(spec.trim).toLowerCase().trim()) spec.trim = "";
  // UNCURATED-TRIM FALLBACK FENCE (Oct 2026, label-vs-sales mismatch job): a trim string that matches
  // none of the curated scoping mechanisms above (subTrimFence, a performance badge, a model family)
  // was until now recorded in spec.trim for DISPLAY only and never used to filter the pool at all - a
  // free-text compound trim resolveVehicle could not match to anything curated (e.g. "Shelby GT500
  // Supercharged Fastback") silently fetched the WHOLE base model while the label kept stating the
  // named trim verbatim ("first-generation Mustang Shelby GT500 Supercharged Fastbacks" over a pool
  // of plain Mustangs). priceBandForVehicle and listSalesForVehicle already carry this exact fallback
  // for Sell's price-step; mirrored here so the general result/thin/refusal path (Market Check, Buy,
  // Tasks) gets the same protection, per the one-engine rule, instead of a third copy.
  // DELIBERATELY NOT gated on !spec.perfInclude (root cause, found live): runOneBox's own famSpec
  // (the trim-to-family widening ladder's `{ ...spec, perfInclude: null, perfExclude: null,
  // excludeVariants: [] }`) strips perfInclude back out before assessThin/fetchPool ever run, so for
  // a make with NO subTrimFence entry of its own (Porsche survives this via subTrimInclude, which
  // famSpec does NOT clear; Ford/Mustang's Shelby/GT350/GT500/Boss/SVT PERF_TRIMS entry has no such
  // backstop) perfInclude silently never reaches the real fetch at all - confirmed live, a "Shelby
  // GT500 Supercharged" query read all 233 plain-Mustang sales with zero trim filtering applied.
  // titleContains is NOT cleared by famSpec, so setting it here even when perfInclude also fired is
  // the backstop: redundant (same effective match) wherever perfInclude does survive, load-bearing
  // wherever it does not. Still skipped when subTrimInclude/badge/familyInclude already fired - those
  // three are NOT cleared by famSpec, so they remain the more precise, non-redundant mechanism.
  {
    const trimTok = spec.trim && String(spec.trim).trim() ? String(spec.trim).trim() : "";
    if (trimTok && !spec.titleContains && !spec.badge && !spec.subTrimInclude && !spec.familyInclude) spec.titleContains = trimTok;
  }
  return relabel(spec);
}

export async function fetchQualifying(spec, sinceIso, env, diag) {
  const fetchT0 = Date.now();   // per-fetch trace (diag.fetches), see the diag line below
  // ONE READ PER QUERY PER REQUEST (e56, speed job): the ladder, the thin check and the identity options read the same
  // archive query more than once in one answer (the 1965 Mustang chip read the 2,864-row five-year window twice, 9.7 s
  // and 7.6 s). The request's diag keeps each query's rows; a repeat returns copies of the same rows, so every stage
  // still gets its own objects to tag. Same rows, same pool, one archive read.
  const memo = diag ? (diag.fetchMemo = diag.fetchMemo || new Map()) : null;
  const selAll = async q => {
    if (memo && memo.has(q)) { const v = memo.get(q); if (diag) (diag.memoHits = (diag.memoHits || 0) + 1); return v == null ? v : v.map(r => ({ ...r })); }
    const got = await supabaseSelectAll(env, q);
    if (memo) memo.set(q, got);
    return got == null ? got : got.map(r => ({ ...r }));
  };
  // FIX 3 (speed job, Oct 15 2026): a spec with no model word (a "Ford" that resolved to the make alone) never reads
  // the whole make (four fetches of 35 to 52 s over 11,581 Ford rows for a Track T project); it answers as not
  // tracked, the same as every other read with nothing to scope.
  if (!spec || !spec.make || !String(spec.model || "").trim() || String(spec.model).trim().toLowerCase() === String(spec.make).trim().toLowerCase()) {
    if (diag) (diag.fetches = diag.fetches || []).push({ titleContains: null, yearMin: null, yearMax: null, since: String(sinceIso || "").slice(0, 10), ms: 0, raw: 0, skipped: "no model word" });
    return [];
  }
  // Reads sales_archive (Sep 2026): the COMPREHENSIVE nightly-ingest sales store (~200k rows,
  // E30 M3: 52 vs 4 in vmr), now index-backed (trigram GIN on model/title/make + btrees on
  // year/sale_date, docs/supabase-sales-archive-indexes.sql) so the leading-wildcard ILIKE
  // comp scope is index-scannable instead of a full seq scan. sales_archive is SOLD-ONLY by
  // construction (ingest fetches OCD with status:"sold"), so there is no sold filter to apply.
  //
  // PHOTO FILTER IS APPLICATION-CODE, NOT IN THE QUERY. Combining a JSONB photo filter
  // (raw_record->>featured_image_url) with the sale_date filter in ONE PostgREST request
  // returned 0 rows in preview pulls (a PostgREST quirk, not an index issue). isQualifying
  // already drops photoless rows (row.image guard), so we omit the photo predicate from the
  // request and let application code enforce it. Never ships a silently-empty pool.
  //
  // Columns aliased to the historical field names so every downstream compute helper
  // (dedupBySaleIdentity, hammerUsd, priceDisplay, mileageInfo) is unchanged. Archive
  // top-level cols: sale_price/sale_date/platform/listing_title/make/model/year; the rest
  // come off raw_record (the full OCD record) exactly as before.
  // LEAN select (Sep 2026): One Box round-3 reads only price/date/source/title/year/image/
  // mileage/mods/body. The heavy raw_record TEXT blobs (description, listing_details,
  // ownership/service history) were 1000x per fetch and made a common-nameplate pull take
  // 10-27s; dropped here. mileageInfo degrades to the structured field without them.
  // LEAN cols for the RECORD path: each raw_record->> JSONB extraction costs ~40ms/row, so the full
  // 13-extract select over 120 rows was ~5.8s (over the <3s bar). The record only needs price/date/
  // venue/title/year/vin + the fields its receipt + hammer back-out + set-aside read (image, currency,
  // url, mileage). ~4 extracts -> ~1.5s. Non-record keeps the full select (it renders rich receipts).
  // stated_mileage / project_flag / desc_facts are the description-derived columns (descriptions
  // resilience). They are cheap top-level columns (no raw_record JSONB extract); the readers prefer
  // them and fall back to a live description parse only when they are null.
  // source_id (Round 5 Lane B job, Oct 2026): cheap top-level column (no JSONB extract), selected
  // so applyRowCorrections below can key on the SAME (platform, source_id) identity scripts/ingest.js
  // uses, catching a mislabelled row (the Merkur XR4Ti/Ford Sierra RS Cosworth case) even if it was
  // somehow re-ingested wrong or never corrected in the table - the "at pool read" half of the fix,
  // the "at ingest" half lives in scripts/ingest.js toFullRow.
  // make,model (Part 4 golden-cars job, Oct 2026): bare top-level columns, no JSONB extract - the
  // structured identity fields checkOutputInvariants/runOutputInvariants compare against the
  // resolved vehicle, instead of regexing the human-formatted title (the source of its own false
  // positives: 911T vs 911, 356A vs 356, 300 SL vs 300SL, Mazda Roadster vs MX-5, 'Cuda vs Barracuda).
  const cols = spec.recordSort
    ? "id,source_id,price:sale_price,auction_end_date:sale_date,source:platform,raw_title:listing_title,year,make,model,vin_norm," +
      "image:raw_record->>featured_image_url,currency:raw_record->>currency,srcurl:raw_record->>url,mileage:raw_record->>mileage," +
      "stated_mileage,project_flag,desc_facts,has_reserve"
    : "id,source_id,price:sale_price,auction_end_date:sale_date,source:platform,raw_title:listing_title,year,make,model,vin_norm," +
      "image:raw_record->>featured_image_url,mileage:raw_record->>mileage,body:raw_record->>body_style," +
      "mods:raw_record->>modifications,rtitle:raw_record->>title,currency:raw_record->>currency," +
      // e59 (Sam's egress job): known_flaws and recent_service_history are NOT read for the pool (thousands of rows); no
      // gate, set-aside reason or classification reads them (qualifyReason reads mods, which stays). They feed only the
      // observable-fact offer and Sam's Take, both on the chosen pool, so obEnrichExtras attaches them to the chosen rows.
      "transmission:raw_record->>transmission,color:raw_record->>exterior_color,ts:raw_record->>title_status,srcurl:raw_record->>url,srcurl2:raw_record->>source_url," +
      "city:raw_record->>city,state:raw_record->>state,cc:raw_record->>country_code,precision:raw_record->>auction_end_precision," +
      "stated_mileage,project_flag,desc_facts,has_reserve";
  const scope = archiveScope(spec);
  const base = `sales_archive?select=${cols}` +
    // RECORD path: make=eq AND no sale_date filter, so the (make, sale_price DESC) composite index
    // serves the query index-ORDERED (no sort) with early termination at the limit. make ILIKE or a
    // sale_date filter both prevent that index from ordering the scan, forcing a slow sort that hits
    // the statement timeout. Non-record keeps ILIKE + the (selective, index-backed) date filter.
    (spec.recordSort ? `&make=eq.${encodeURIComponent(spec.make)}` : `&make=ilike.${encodeURIComponent(spec.make)}`) +
    `&sale_price=not.is.null` + VT_CAR +
    // Omit the date filter ONLY on the primary all-time record scan (so the (make,sale_price) index
    // orders it). The BOUNDED fallback (recordFallback) re-adds the date filter to genuinely shrink
    // the set when the all-time scan timed out. Non-record always keeps it.
    ((spec.recordSort && !spec.recordFallback) ? "" : `&sale_date=gte.${sinceIso.slice(0, 10)}`) +
    (spec.yearMin ? `&year=gte.${spec.yearMin}` : "") +
    (spec.yearMax ? `&year=lte.${spec.yearMax}` : "") +
    // Exact-trim DB scope: when the ladder wants only a named trim, filter the TITLE at the
    // database so a common nameplate pulls the ~dozens of trim rows, not the whole family.
    // ONE-LETTER TRIM (Lane B job, Oct 13 2026, "Porsche 911 R" timed out twice): a trim of a single character
    // ("R") pre-filtered the database as ilike *R*, which matches every title with that letter - the whole
    // marque's archive paged down before the in-memory fence (subTrimInclude, /\b911\s*r\b/) ever ran. The
    // pre-filter now carries the model word too, with its space kept ("*911 R*" reaches the 911 R, the RS and
    // the RSR titles, a few hundred rows, not tens of thousands); the fence decides membership exactly as before.
    // FIX 1 (speed job, Oct 15 2026): a TWO-character token ("V8", "5I", "0I") gets NO database title pre-filter: the
    // trigram index cannot serve a two-character pattern, so the database scanned 25 s to return 14 R8 V8 rows while
    // the plain nameplate read of all 606 R8 rows took 2.4 s. The in-memory fence (qualifyReason's titleContains
    // check) decides membership exactly as before, so the pool is identical; only the scan is gone. One character
    // keeps its model-word rule (911 R), three or more keep the index-served pre-filter.
    (spec.titleContains && !(/^[a-z0-9]{2}$/i.test(String(spec.titleContains).trim())) && !(/^\d+\.\d+$/.test(String(spec.titleContains).trim())) ? `&listing_title=ilike.${encodeURIComponent("*" + (/^[a-z0-9]$/i.test(String(spec.titleContains).trim()) && spec.model ? `${String(spec.model).trim()} ${String(spec.titleContains).trim()}` : trimIlike(spec.titleContains)) + "*")}` : "") +
    // RECORD path (Desk): order by PRICE desc with a tight limit, so an all-time "highest sale"
    // finds the real top even for a high-volume model whose record is older than the recent 1000.
    // The DB sorts the model-scoped subset and returns the top rows fast (no wide date scan).
    // Record: 300 top-by-price rows of the MARQUE (make=eq, NO per-row filter during the walk, so the
    // (make, sale_price DESC) composite index range-scans index-ordered and terminates early ~1s). The
    // badge is filtered IN CODE afterwards; 300 is deep enough that a high-volume badge's top-5 standard
    // sales are always present even after the marque's other high-priced cars (507, M1, Z8) take slots.
    // NON-RECORD: NO limit here - the non-record reads page the FULL window via supabaseSelectAll
    // (Supabase caps a bare limit= at db-max-rows=1000, so a popular car's 36-month pool silently
    // topped out near 1000 and the range/count were computed on a partial, recency-biased sample).
    // DETERMINISTIC PAGES (e56, Oct 16 2026, the typed-vs-chip two-row gap): a Range-paged read ordered by sale_date
    // alone is not a stable order (many sales share a date), so concurrent pages with offsets could drop a row at a
    // page boundary and double another; obdiag showed 143 "not returned by any fetch" rows on one read of the first-
    // generation Mustang and 405 on the next. The id tiebreaker makes every page the same every time.
    (spec.recordSort ? `&order=sale_price.desc,id.asc&limit=300` : `&order=sale_date.desc,id.asc`);
  // Filter order matches the index plan: model/title trgm -> year -> sale_date; photo in app code.
  // Badged families search the archive TITLE for the badge; everything else the model.
  // Space/hyphen normalization (Part 3): the archive stores alnum model codes BOTH ways, split by
  // platform - online titles a Mercedes "300SL" (62 sales), the houses title it "300 SL" (50), two
  // DISJOINT sets, so a single literal ILIKE returns whichever spelling the seller typed and misses
  // the other half. Fix with ONE ilike that inserts a `*` wildcard at the digit<->letter boundary
  // of a DISTINCTIVE code (a 3+ digit run touching letters): "300SL"/"300 SL"/"300-SL" all become
  // the pattern *300*SL* and match the full union. A single top-level filter, so the proven %2A
  // wildcard decoding works (unlike or=, where PostgREST does not decode it). Guarded to distinctive
  // codes: short badges (M3, A6, GT3) and pure-digit models (275, 911, 997) are left exact.
  const flexPattern = t => {
    const s = String(t || "").trim();
    // A DISTINCTIVE alnum code (a 2+ digit run touching letters) is stored BOTH ways across
    // platforms ("300SL"/"300 SL", "S65"/"S 65", "D50"/"D-50"): insert a `*` wildcard at the
    // digit<->letter boundary so one ILIKE matches the union. Broadened from 3+ to 2+ digits
    // (item 1, Sep 2026) so a 2-digit badge/series (S65, C63, D50) matches its spaced twin too;
    // the in-code badge word-boundary + truck-series guards re-filter the wider DB match, and a
    // 1-digit code (M3, A6, GT3) or a pure-digit model (911, 997) is left EXACT (no over-match).
    if (/\d{2,}[\s-]?[A-Za-z]/.test(s) || /[A-Za-z][\s-]?\d{2,}/.test(s)) {
      return s.replace(/[\s-]+/g, "").replace(/(\d{2,})([A-Za-z])/g, "$1*$2").replace(/([A-Za-z])(\d{2,})/g, "$1*$2");
    }
    return s;
  };
  const modelQ = t => `${base}&model=ilike.${encodeURIComponent("*" + flexPattern(t) + "*")}`;
  const titleQ = t => `${base}&listing_title=ilike.${encodeURIComponent("*" + flexPattern(t) + "*")}`;
  // RECORD scope (Desk, Sep 2026 fix): scope the record on the MODEL column, not the title, so the
  // price-sorted scan does not walk past non-badge high-price cars (507, M1, Z8) the way the title
  // ILIKE did (that timed out ~9s). Fetch with a plain trigram ILIKE (reliably index-served, ~0.3s;
  // the \y word-boundary regex was only INTERMITTENTLY index-served -> occasional 8s seq-scan +
  // retry), then apply the WHOLE-WORD filter IN CODE so "M3" catches "(E46) M3"/"M3 CSL" but never
  // "M340i". The shared set-aside then drops the DTM race car / CSL halo so the record is the top
  // STANDARD sale.
  // The record uses `base` AS-IS (make=eq + order price + limit 300, NO model/title filter) so the
  // (make, sale_price DESC) composite index range-scans index-ordered and terminates at 300 (~1s,
  // stable). Applying ANY leading-wildcard filter DURING that walk (title or model ILIKE) forced a
  // per-row recheck / weak-trigram sort that intermittently hit the 8s timeout. The badge is filtered
  // IN CODE (whole word, so "M3" never matches "M340i"). Title fallback only if the marque top-300 is
  // thin for this badge (low-volume badge on a high-volume marque).
  const recordWholeWord = t => { const esc = String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i"); };
  const t0 = Date.now();
  let rawRows;
  // supabaseSelect returns null on a FAILED query (non-ok/timeout) and [] on a genuine empty
  // result. Surface the failure via diag.queryError so a caller (the Desk executor) can retry and
  // fail loudly instead of rendering a swallowed [] as an honest "thin"/empty pool. One Box ignores
  // the flag (its thin/refusal path is unchanged); only the Desk consumes it.
  // RECORD scope decision: a generic performance TRIM mis-set as a badge ("944 Turbo" -> badge "Turbo",
  // "911 Carrera" -> "Carrera") must scope by the MODEL (944) with the trim in the title, NOT the whole
  // marque's "Turbo" cars (which returned a 911 TAG Turbo for a 944 Turbo record). A true model-badge
  // (M3, where model === badge) keeps the fast top-of-marque badge scope.
  let recVia = null, recModelToken = null, recTitleTrim = null;
  if (spec.recordSort) {
    const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (scope.byTitle && spec.model && norm(spec.model) !== norm(scope.byTitle)) { recVia = "model"; recModelToken = String(spec.model).replace(/^[A-Za-z]\d{2,3}\s+/, "").trim() || spec.model; recTitleTrim = scope.byTitle; }
    else if (scope.byTitle) recVia = "title";
    else if (scope.byModel) { recVia = "model"; recModelToken = scope.byModel; recTitleTrim = spec.titleContains || null; }
  }
  if (recVia === "title") {
    // True model-badge (M3): pull the marque's top-300 by price (base, index-ordered, ~1s), filter the
    // badge whole-word IN CODE. Title fallback only if the marque top-300 is thin for this badge.
    const got = await supabaseSelect(env, base); if (got === null && diag) diag.queryError = true;
    const ww = recordWholeWord(scope.byTitle);
    rawRows = (got || []).filter(r => ww.test(String(r.model || "")) || ww.test(String(r.raw_title || "")));
    if (rawRows.length < 5) { const more = (await supabaseSelect(env, titleQ(scope.byTitle))) || []; const seen = new Set(rawRows.map(r => r.id)); for (const r of more) if (!seen.has(r.id)) rawRows.push(r); }
  }
  else if (recVia === "model") {
    // Model record (944 Turbo, 2002tii, 190E 2.3-16, 240Z): scope by the MODEL trigram + the named trim
    // in the title, and do NOT ask the DB to sort by price (a leading-wildcard ILIKE + ORDER BY sale_price
    // is planner-unstable and timed out for a higher-volume model like 944). PAGE the model's rows
    // unordered (trigram filter, index-served, cheap per page) to completion; the record output sorts by
    // price + applies the set-aside in code. make ILIKE (not the marque price-walk that never reaches a
    // cheaper model on a marque full of pricier cars).
    const trimQ = recTitleTrim ? `&listing_title=ilike.${encodeURIComponent("*" + recTitleTrim + "*")}` : "";
    const rqBase = `sales_archive?select=${cols}&make=ilike.${encodeURIComponent("*" + spec.make + "*")}&model=ilike.${encodeURIComponent("*" + flexPattern(recModelToken) + "*")}&sale_price=not.is.null${VT_CAR}${trimQ}`;
    // REVERTED (same day): swapping this to supabaseSelectAll (200k ceiling) + verifyExactCount's
    // extra count=exact round trip made a high-volume model (Mustang) time out the whole request -
    // paging tens of thousands of rows sequentially, plus a slow exact-count scan on top, is far too
    // slow for a user-facing request. Restored the original 4000-row bounded loop (fast, index-served)
    // pending a properly benchmarked fix; the under-4000-rows truncation risk this audit flagged is
    // real but lower severity than a request timeout, see docs/lane-notes.md.
    const all = [];
    for (let off = 0; off < 4000; off += 1000) {
      const pageRows = await supabaseSelect(env, `${rqBase}&order=id.asc&limit=1000&offset=${off}`);
      if (pageRows === null) { if (diag) diag.queryError = true; break; }
      for (const r of pageRows) all.push(r);
      if (pageRows.length < 1000) break;
    }
    const ww = recordWholeWord(recModelToken);
    rawRows = all.filter(r => ww.test(String(r.model || "")) || ww.test(String(r.raw_title || "")));
    // Title fallback if the model column is thin for this nameplate (mislabels): match the title, paged.
    if (rawRows.length < 5) {
      for (let off = 0; off < 2000; off += 1000) {
        const pr = await supabaseSelect(env, `sales_archive?select=${cols}&make=ilike.${encodeURIComponent("*" + spec.make + "*")}&listing_title=ilike.${encodeURIComponent("*" + flexPattern(recModelToken) + "*")}&sale_price=not.is.null${VT_CAR}${trimQ}&order=id.asc&limit=1000&offset=${off}`) || [];
        const seen = new Set(rawRows.map(r => r.id)); for (const r of pr) if (!seen.has(r.id)) rawRows.push(r);
        if (pr.length < 1000) break;
      }
    }
  }
  else if (scope.byTitle) { const got = await selAll(titleQ(scope.byTitle)); if (got === null && diag) diag.queryError = true; rawRows = got || []; }
  else if (scope.byFamily) {
    // Family-head fetch (SL-Class, S-Class, ...): make/year/date-bounded, NO model/title string
    // (the archive never titles these cars by the family head), narrowed in-code by the family's
    // own badgeRe via familyBadgeMatch (same regex the classify-side catch-all uses, so a Market
    // Check pool and a classified pool agree).
    const got = await selAll(base); if (got === null && diag) diag.queryError = true;
    rawRows = (got || []).filter(r => familyBadgeMatch({ make: spec.make, model: spec.model }, { title: r.raw_title || r.rtitle }));
    if (diag) diag.familyScope = true;
  }
  else {
    // The model read, its title twin (accent union, below) and the chassis-code twin (union, below) are
    // three independent archive reads of the same scope; they run CONCURRENTLY (Lane B, Oct 14 2026: run
    // one after another they put the 2008 997 Carrera S cold compute at 22 seconds). Same rows, same
    // order of union (model, then title extras, then code extras), fewer sequential round trips.
    const altModels = chassisAltModels(spec);
    const [got, gotTitle, ...gotAlts] = await Promise.all([
      selAll(modelQ(scope.byModel)),
      scope.byModel ? selAll(titleQ(scope.byModel)) : Promise.resolve([]),
      ...altModels.map(a => selAll(modelQ(a)))
    ]);
    if ((got === null || gotTitle === null || gotAlts.some(g => g === null)) && diag) diag.queryError = true;   // e64: any leg that failed is a failed read
    rawRows = got || [];
    // ACCENT UNION (Sep 2026, was a fallback): the archive INCONSISTENTLY accents the MODEL column
    // ("Murciélago" on the BaT rows, "Murcielago" on a Barrett-Jackson row) while the listing TITLE
    // reliably carries the deaccented name. Matching only the model column drops the accented rows,
    // and an empty-only retry never fired when a single deaccented row existed (typed "Murcielago
    // LP640" saw 1 sale while the VIN class-era pool saw 9). ALWAYS union the title match so both
    // spellings come in and typed + VIN read the SAME pool. base is make/date-scoped, so bounded.
    if (scope.byModel) {
      const byTitle = gotTitle || [];
      if (byTitle.length) { const seen = new Set(rawRows.map(r => r.id)); for (const r of byTitle) if (!seen.has(r.id)) rawRows.push(r); if (diag) diag.accentUnion = true; }
    }
    // CHASSIS-CODE UNION (Sam, Oct 14 2026, "2008 Porsche 911 Carrera S Coupe" read 10 sales, "2008 997
    // Carrera S Coupe" 14): the archive files the same car under the nameplate ("911") on some rows and
    // under its chassis code ("997") on others, and a model-column fetch read only one side. Same car,
    // same words in a different form, must give the same pool: a nameplate query with a chassis-code
    // generation also fetches the code's rows, and a chassis-code query also fetches the nameplate's,
    // both inside the same year bound, title filter and window (base). Union by id.
    altModels.forEach((alt, i) => {
      const more = gotAlts[i] || [];
      if (more.length) { const seen = new Set(rawRows.map(r => r.id)); for (const r of more) if (!seen.has(r.id)) rawRows.push(r); if (diag) diag.chassisUnion = (diag.chassisUnion || []).concat(alt); }
    });
  }
  // POOL-TERM UNION (change 4a): a model whose family spans rebadged siblings under DIFFERENT makes
  // (Dodge D50 = Ram 50 = Plymouth Arrow Truck = Mitsubishi Mighty Max) pools them together, each
  // card labelled by its own title (Rule 25). Make-AGNOSTIC title search, year/date-scoped. The
  // qualifyReason truck-series guard is told to accept these siblings via spec._poolTerms (below).
  const _mrRule = mrRulesFor(spec.make, spec.model);
  if (_mrRule && _mrRule.poolTerms && _mrRule.poolTerms.length) {
    spec._poolTerms = _mrRule.poolTerms;
    const dateClause = (spec.recordSort && !spec.recordFallback) ? "" : `&sale_date=gte.${sinceIso.slice(0, 10)}`;
    const yClause = (spec.yearMin ? `&year=gte.${spec.yearMin}` : "") + (spec.yearMax ? `&year=lte.${spec.yearMax}` : "");
    const seen = new Set((rawRows || []).map(r => r.id));
    rawRows = rawRows || [];
    for (const term of _mrRule.poolTerms) {
      const q = `sales_archive?select=${cols}&sale_price=not.is.null${VT_CAR}${dateClause}${yClause}&listing_title=ilike.${encodeURIComponent("*" + term + "*")}&order=sale_date.desc,id.asc`;
      const got = (await selAll(q)) || [];
      for (const r of got) if (!seen.has(r.id)) { seen.add(r.id); rawRows.push(r); }
    }
    if (diag) diag.poolTermsUnion = true;
  }
  if (diag) { diag.ms = (diag.ms || 0) + (Date.now() - t0); diag.queries = (diag.queries || 0) + 1; }
  // SOURCE-ROW CORRECTIONS, pool-read half (Round 5 Lane B job, Oct 2026): applied here, before
  // dedup/qualify, so a known mislabelled row (lib/_corrections.js) reads correctly even if the
  // ingest-time fix (scripts/ingest.js toFullRow) never touched this particular stored row - a
  // belt-and-suspenders defensive layer, not the primary fix.
  applyRowCorrections(rawRows);
  // PREREQUISITE: content-based dedup BEFORE anything counts or pools (OCD assigns two
  // source_record_ids to one house sale; the DB key cannot catch it).
  // FLAG A fix (Sep 2026): UK/EU/AU-only marketplaces are held out of a US car's comp pool, the
  // same gate /sell applies via evidenceCapable:false - Car & Classic (EUR), Collecting Cars
  // (AUD), The Market (GBP), PistonHeads (GBP) do not enter One Box comps until UK evidence-
  // routing is formally approved. Matched on the platform LABEL (what sales_archive stores).
  // IN THE MARKET (Sam's decision, Oct 14 2026): every row is stamped with the country the venue's own
  // fields give (row.country / row.countryBasis, lib/_classify.js marketCountry) and only United States
  // and Canada sales enter any pool, range or count. The diag keeps the rows the rule held out.
  const dedupedAll = dedupBySaleIdentity(rawRows).map(stampCountry);
  const rows = dedupedAll.filter(inMarket);
  // e67 (diagnosis only): the ids every fetch returned (deduped), so the diagnosis read can tell a sale the fetch never
  // returned from one a later step dropped. Collected only for the diagnosis read; nothing else reads it.
  if (diag && diag.collectExcluded) { diag.fetchedIds = diag.fetchedIds || new Set(); for (const r of dedupedAll) if (r && r.id != null) diag.fetchedIds.add(String(r.id)); }
  if (diag) { for (const r of dedupedAll) if (!inMarket(r)) (diag.abroad = diag.abroad || []).push({ row: r, reason: `outside the market (${r.country || "country unknown"}, by ${r.countryBasis})`, fetch: `${spec.titleContains || "-"} ${spec.yearMin ?? ""}-${spec.yearMax ?? ""} since ${String(sinceIso || "").slice(0, 10)}${spec.houseTier ? " house" : ""}` }); }
  if (diag) {
    diag.fetchedRaw = (diag.fetchedRaw || 0) + rawRows.length; diag.fetchedDeduped = (diag.fetchedDeduped || 0) + rows.length;
    // PER-FETCH TRACE (Lane B, Oct 2026, the 911 R timeout): which fetch in a run cost what - the scope
    // (title pre-filter, year bound, window), its raw row count and its milliseconds - so a slow run can
    // be read from task=obdiag's dedup.fetches instead of guessed. Diagnostic only, never rendered.
    (diag.fetches = diag.fetches || []).push({ titleContains: spec.titleContains || null, yearMin: spec.yearMin ?? null, yearMax: spec.yearMax ?? null, since: String(sinceIso || "").slice(0, 10), houseTier: !!spec.houseTier, raw: rawRows.length, ms: Date.now() - fetchT0, filter: String(base || "").replace(/select=[^&]*&?/, "").slice(0, 400), byModel: scope && scope.byModel || null, byTitle: scope && scope.byTitle || null, queryError: !!(diag && diag.queryError) });   // e65: the exact filter, so a sale the fetch missed can be explained from the trace
  }
  spec._featureStems = modFeatureStems(rows);   // e65: the prevalence guard of the modified rule
  const qualified = rows.filter(r => isQualifying(r, spec));
  // No silent drops (Sam Desk): when asked, record every deduped row the qualifier rejected,
  // WITH the reason, so the Desk can show it excluded instead of it vanishing. Same logic as
  // isQualifying (qualifyReason is its reason-returning form), so One Box and the Desk agree.
  if (diag && diag.collectExcluded) {
    diag.excluded = diag.excluded || [];
    const fetchTag = `${spec.titleContains || "-"} ${spec.yearMin ?? ""}-${spec.yearMax ?? ""} since ${String(sinceIso || "").slice(0, 10)}${spec.houseTier ? " house" : ""}`;
    for (const r of rows) { const reason = qualifyReason(r, spec); if (reason) diag.excluded.push({ row: r, reason, fetch: fetchTag }); }
  }
  // Normalize the COMPUTE basis: USD implied hammer (house premium backed out) + mileage
  // capability. Display facts stay native and are attached at card time. Drop rows with no
  // usable computed value so ranking never mixes bases or trips on a bad price.
  for (const r of qualified) { r.value = hammerUsd(r); r.mi = mileageInfo(r); }
  const priced = qualified.filter(r => Number.isFinite(r.value));
  // RULE 5 POOL GUARD (Part 1, Oct 2026): model-boundary + worldwide year-gate + deny, plus the
  // tag-don't-delete split for same-model distorting variants. DROPS a different car (deny / wrong
  // era / no-year title-mismatch) and a replicaSeparate replica from this pool; KEEPS a same-model
  // special edition / restomod, marked r._tag, so a downstream step can show it "separately" and
  // exclude it from the headline range. A no-op for any model not in modelRules (fallback = today).
  // spec.suppressGuard opts a caller out (e.g. a diagnostic that wants the raw pool).
  if (spec && spec.suppressGuard) return priced;
  const guard = rule5PoolGuard(priced, spec);
  if (!guard.applied) return priced;
  if (diag) { diag.rule5 = { removed: guard.removed.length, tagged: guard.tagged.length, replica: guard.replica.length, noYearKept: guard.noYearKept }; }
  return guard.kept;
}

const SAM_LINE = {
  // Full-pool grounded (STEP 3): "closest match" is the comp nearest yours on spec+mileage;
  // the spread claim is about the whole qualified set, never read off the three shown cards.
  three: "I'd anchor on the closest match. Across the full set of comparable sales, the differences come down to spec, mileage and condition.",
  two: "There aren't enough comparable sales to call this a market range yet, so I'm showing you the two relevant sales I have.",
  one: "There isn't enough recent comparable activity here to show you an honest market range, but this is one relevant sale.",
  zero: "I do not have enough comparable sales to show you an honest spread here. Results like this sit scattered across the record, and a range would invent a pattern that is not there.",
  underspecified: "The sold examples here vary too much to show you an honest spread. Add the trim or engine, like the exact edition, and I'll compare like for like."
};

// Trust line (STEP 4): N = the real post-dedup, post-filter, post-outlier qualified
// count. Small-pool honest variants for N=1 / N=2. Null for zero (samLine carries it).
function trustLine(n) {
  if (n >= 3) return `I found ${n} relevant sales. Here are the three I'd pay most attention to.`;
  if (n === 2) return "I found two comparable sales I'd actually use.";
  if (n === 1) return "I found one sale I'd actually use.";
  return null;
}

// ---- Round-3 result-model helpers (mirror /onebox-preview, the locked design of record) ----
const r500 = n => Math.round(n / 500) * 500;
// ROUNDING LADDER (Part 3): a RANGE END rounds to a step that scales with magnitude - nearest
// $500 under $100,000, nearest $1,000 from $100,000 through $1,000,000, nearest $5,000 above.
// Individual sale prices are NEVER rounded (cards read raw _usd; prose reads usd() of the real
// hammer). `roundNearest` is for a typical-band edge; `roundFloor`/`roundCeil` keep a containment
// span ("everything from X to Y has sold") bracketing every real sale - low floors, high ceils.
const roundStep = n => { const a = Math.abs(Number(n) || 0); return a < 100000 ? 500 : a <= 1000000 ? 1000 : 5000; };
const roundNearest = n => { const s = roundStep(n); return Math.round(n / s) * s; };
const roundFloor = n => { const s = roundStep(n); return Math.floor(n / s) * s; };
const roundCeil = n => { const s = roundStep(n); return Math.ceil(n / s) * s; };
// RANGE LADDER by qualified pool size (Part 3): 16+ cluster band + Sam's Take; 8-15 the middle-half
// (p25-p75) band with a count-forward headline; 3-7 the sales themselves, NO range; 1-2 a single
// sale; 0 not tracked. One name for the bucket so every surface reads it the same way.
function rangeTierForCount(n) {
  if (n >= 16) return "cluster";
  if (n >= 8) return "band";
  if (n >= 3) return "thin";
  if (n >= 1) return "single";
  return "none";
}
function percentile(arr, q) {
  const s = [...arr].sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const MON3 = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthYear(d) { const p = String(d || "").slice(0, 10).split("-"); return p.length >= 2 ? `${MON3[Number(p[1])] || ""} ${p[0]}`.trim() : ""; }

// Freshness (S2-2): the pipeline's newest ONLINE sale is the real "is ingest current?" signal.
// BaT/C&B close daily, so a successful nightly ingest always leaves a sale dated yesterday. When
// the freshest online sale is >2 days stale, ingest did not run - so the line states the real
// date instead of "last night". Cached ~30 min per instance (one cheap read, never metered).
let _obIngestDate = null, _obIngestAt = 0;
async function oneBoxIngestDate(env) {
  if (obAsOfDate()) return obAsOfDate();
  if (_obIngestDate !== null && (Date.now() - _obIngestAt) < 30 * 60 * 1000) return _obIngestDate;
  try {
    // sales_archive stores the DISPLAY LABEL in `platform` and the slug in `source_slug` (ingest.js);
    // recent rows always carry source_slug, so key the "freshest online sale" read on the slug.
    const rows = await supabaseSelect(env, `sales_archive?select=sale_date&source_slug=in.(bringatrailer,carsandbids)&order=sale_date.desc&limit=1`);
    _obIngestDate = (rows && rows[0] && String(rows[0].sale_date || "").slice(0, 10)) || "";
  } catch (e) { _obIngestDate = ""; }
  _obIngestAt = Date.now();
  return _obIngestDate;
}
// Pool-aware freshness fact (rendered by the frontend, never asserted as data freshness beyond
// what is true). Online pools ride the ingest signal; house pools state the newest house result
// actually in the pool, since house feeds report on their own cadence (rule: never "last night"
// for a house-led read a high-end owner may already know a fresher sale we do not have).
function obFreshness(houseLed, newestPoolDate, ingestDate, now) {
  const newest = String(newestPoolDate || "").slice(0, 10) || null;
  // archiveThrough = the archive's freshest online sale (the ingest currency). Carried on every
  // freshness object (item 7c) so the frontend can state two facts when the in-scope newest sale is
  // older than the archive's newest ("Sales through last night." + "Latest {model} sale: {month year}").
  const fresh = String(ingestDate || "").slice(0, 10) || null;
  if (houseLed) return { mode: "house", through: newest, archiveThrough: fresh };
  // Item 6: the freshness line describes THIS answer, so `through` reads the newest sale IN SCOPE,
  // never the global BaT/C&B ingest date (which can be fresher than anything in this pool and would
  // over-claim the scope's recency). The "last night" phrasing fires only when the newest in-scope
  // sale IS from the last two days AND ingest is current, so it never claims a freshness the scope
  // does not actually have. ingestDate is now only a currency corroborator, never the stated date.
  const twoAgo = new Date(now - 2 * DAY).toISOString().slice(0, 10);
  if (newest && newest >= twoAgo && fresh && fresh >= twoAgo) return { mode: "online", lastNight: true, through: newest, archiveThrough: fresh };
  return { mode: "online", lastNight: false, through: newest, archiveThrough: fresh };
}
function obNewestDate(rows) {
  return (rows || []).map(r => String(r.date || r.auction_end_date || r.sale_date || "").slice(0, 10)).filter(Boolean).sort().pop() || null;
}
function miText(row) { const n = Number(String(row.mileage == null ? "" : row.mileage).replace(/[^\d]/g, "")); return n ? n.toLocaleString("en-US") + " mi" : "mileage n/a"; }
// Platform naming for the strip/cards: a NAMED allowlist only. Live auction houses (RM
// Sotheby's, Gooding, Bonhams, Mecum) are NEVER named on this surface (product invariant);
// they fold into "others". A platform stands alone only at 3+ sales.
const OB_NAMED = { bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", pcarmarket: "PCarMarket", hagerty: "Hagerty" };
// Resolve via sourceSlugOf (exact label->slug map), NOT a naive strip-non-alpha: the latter turned
// the stored label "Cars & Bids" into "carsbids" (not "carsandbids"), so it missed OB_NAMED and
// rendered "others". sourceSlugOf maps "cars & bids" -> "carsandbids" and passes real slugs through.
const platSlug = s => sourceSlugOf(s);
const platNamed = s => OB_NAMED[sourceSlugOf(s)] || "others";
// UK/EU/AU-only marketplaces held out of One Box comps until UK evidence-routing is approved
// (mirrors /sell's evidenceCapable:false). Matched on the platform LABEL sales_archive stores.
// (The old OB_REGION_EXCLUDED venue hold-out is now one case of the country rule, lib/_classify.js
// marketCountry / inMarket: United States and Canada in, everything else out, on every pool build.)
function foldPlatforms(rows) {
  const named = {}; let others = 0;
  for (const r of rows) { const nm = OB_NAMED[platSlug(r.source)]; if (nm) named[nm] = (named[nm] || 0) + 1; else others++; }
  const out = [];
  for (const [nm, c] of Object.entries(named)) { if (c >= 3) out.push([nm, c]); else others += c; }
  out.sort((a, b) => b[1] - a[1]);
  if (others) out.push(["others", others]);
  return out;
}
// Short descriptors for the set-aside outliers, folded into the mono meta line.
const ASIDE_CATS = [["Sport Evolution", /sport\s?evolution|\bevo\b/i], ["Cecotto", /cecotto/i], ["lowest-mileage", /\b\d+k[-\s]?miles?\b|delivery[-\s]?mile/i], ["Cabriolet", /cabriolet|convertible/i], ["special edition", /anniversary|clubsport|lightweight|\bcsl\b|\bcs\b/i]];
function outlierTags(hollow) {
  return ASIDE_CATS.filter(([, re]) => hollow.some(r => re.test(String(r.raw_title || r.rtitle || "")))).map(([n]) => n).slice(0, 3);
}
// Distinct variant tokens for the refusal template (best-effort; degrades to the no-variant form).
const VARIANT_RE = /\b(S[1-4]|SE|V8|V12|Turbo\s?S?|Spyder|Speedster|GTS|GT[234]|GTB|GTC|RS|Evolution|Cabriolet|Roadster|Competition)\b/gi;
function variantTokens(rows) {
  const seen = new Map();
  for (const r of rows) { const t = String(r.raw_title || r.rtitle || ""); let m; VARIANT_RE.lastIndex = 0; while ((m = VARIANT_RE.exec(t))) { const k = m[1].replace(/\s+/g, " ").trim(), key = k.toLowerCase(); if (!seen.has(key)) seen.set(key, k); } }
  return [...seen.values()];
}

// ---- Halo vocabulary for the trim-to-family ladder (Sep 2026) ----
// Per make, a title matcher for the PERFORMANCE/SPECIAL halo over a common family. Used two
// ways: (1) a base/unspecified query ALWAYS sets these aside (direction rule: never widen a
// base pool up into the halo), and (2) a halo-trim query that widens to the family labels them
// "set aside" so the seller sees his car sits above the family market. Extends the fetch-time
// PERF_TRIMS with the collector-special variants a range should never fold in.
const HALO_PATTERNS = [
  // "competition" removed (Sep 2026): it is the MAINSTREAM M-car variant (audit: 29% of M4,
  // 15% of M3 sales), not a rare halo - setting it aside gutted the M-car pool. CSL/CS/GTS/
  // Sport Evolution/Cecotto stay: genuine limited specials that sit above the base M-car.
  // M-car homologation/limited specials that sit ABOVE the base M-car (so a base pool sets them
  // aside, and a record never returns one as the "max"). Sep 2026: added CRT, Lightweight, Lime
  // Rock Park and the M-car GT/GTR (the M3 GT/GTR that the /amg-style base pattern missed - the
  // same gap the leak audit flagged on E36 M3 GT). "Evolution" (mainstream E36) is NOT matched
  // (\bevo\b needs a boundary, absent in "Evolution"); only "Sport Evolution" is.
  { make: /^bmw$/i, re: /(\bcsl\b|\bcs\b|sport\s?evolution|\bevo\b|cecotto|\bgts\b|\bcrt\b|lightweight|lime\s?rock|\bm[2-8]\s?gtr?\b)/i },
  { make: /porsche/i, re: /\b(gt3\s?rs|gt3|gt2\s?rs|gt2|turbo\s?s|\bgts\b|gt4\s?rs|gt4|speedster|sport\s?classic|\br\b|\bs\/t\b|sc\/rs)\b/i },
  // Ferrari: the track/limited specials above a base model, PLUS the flagship hypercars and
  // limited specials that must never read as a comp for a regular model (the 550 house-flow leak
  // surfaced an Enzo at $8.5m and a Superamerica in a "wider Ferrari market" band). Bare "gto"
  // is NOT matched (it would catch the 250 GTO handling elsewhere); the specific 288/599 GTO are.
  { make: /ferrari/i, re: /\b(speciale|scuderia|pista|competizione|\btdf\b|stradale|\bsv\b|\bcs\b|xx|\bm\b\s|challenge|enzo|la\s?ferrari|f40|f50|superamerica|barchetta|aperta|\b16m\b|monza\s?sp\d?|daytona\s?sp\d?|sesto\s?elemento|288\s?gto|599\s?gto|250\s?gto)\b/i },
  { make: /lamborghini/i, re: /\b(sv|superveloce|svj|svr|performante|\bsto\b|tecnica|jota|versace|revent[oó]n|anniversario|40th\s+anniversary|centenario|veneno|sesto\s+elemento|diablo\s+gtr?)\b/i },
  // CODE tokens (z06/zr1/zl1/z28, gt500/gt350) now use codeGluedSrc (trim-fence sweep, Oct 2026): the
  // old `\b(...)\b` wrapping around the whole alternation never landed its trailing boundary against
  // a glued letter suffix (GT350R, GT350CR, GT500KR - both the code's last digit and the glued letter
  // are word characters, so no boundary exists there), letting these sub-variants pass as "not a
  // halo." Plain-word tokens (grand sport, iroc, callaway, copo, l88, yenko, ss\d*, z11, pace car,
  // baldwin-motion / shelby, boss, svt, mach 1, cobra jet, kr) are unaffected by this shape and keep
  // their own `\b(...)\b` group.
  { make: /chevrolet/i, re: new RegExp(`${codeGluedSrc(trimCodePattern("z06"))}|${codeGluedSrc(trimCodePattern("zr1"))}|${codeGluedSrc(trimCodePattern("zl1"))}|${codeGluedSrc(trimCodePattern("z28"))}|\\b(grand\\s?sport|iroc|callaway|copo|l88|yenko|ss\\d*|z11|pace\\s?car|baldwin[\\s-]?motion)\\b`, "i") },
  { make: /ford/i, re: new RegExp(`shelby|${codeGluedSrc(trimCodePattern("gt500"))}|${codeGluedSrc(trimCodePattern("gt350"))}|\\b(boss|svt|mach\\s?1|cobra\\s?jet|kr)\\b`, "i") },
  { make: /mercedes|benz/i, re: /\b(amg|\b63\b|\b65\b|\b55\b|black\s?series|\bdtm\b)\b/i },
  { make: /dodge/i, re: /\b(hellcat|demon|redeye|\bacr\b|scat\s?pack|\bsrt\b|daytona|superbird|super\s?bee|\bt\/a\b)\b/i },
  // Aston Martin + Jaguar (batch 1): named limited / race / homologation specials that sit above the
  // base model - Zagato, GT8/GT12, DB4 GT, One-77, Vulcan, Valkyrie, Vantage GT3; Jaguar Lightweight
  // E-Type, Low Drag, Project 7, XKR-S, F-Type SVR. Auto-approved halos (named limited/race cars).
  { make: /aston/i, re: /\b(zagato|\bgt8\b|\bgt12\b|\bgt3\b|db4\s?gt|one-?77|vulcan|valkyrie|valour|\bv600\b|vantage\s?gt)\b/i },
  { make: /jaguar/i, re: /\b(lightweight|low\s?drag|project\s?7|project\s?8|xkr-?s|\bsvr\b|\bsvo\b)\b/i },
  { make: /nissan/i, re: /\b(nismo|\br32\b|\br33\b|\br34\b|\bz\s?tune\b)\b/i },
  { make: /toyota/i, re: /\b(trd\s?pro)\b/i },
  { make: /honda|acura/i, re: /\b(type\s?r|type\s?s)\b/i },
  // McLaren: within a base pool (e.g. Senna) the track-only / ultra-limited variants are their OWN
  // cars and must be set aside so they never mix into the base range: Senna GTR (track-only), Senna
  // LM / "LM 25" (ultra-rare), and MSO (McLaren Special Operations bespoke). Keeps the base road-car
  // pool honest (Sam: Senna, Senna GTR, Senna LM, LM 25 and MSO are different cars).
  { make: /mclaren/i, re: /\b(gtr|lm\s?25|\blm\b|mso|\bhs\b|can-?am)\b/i }
];
function haloMatcherFor(make) { const h = HALO_PATTERNS.find(p => p.make.test(make || "")); return h ? h.re : null; }
export { haloMatcherFor };
// INTRINSIC-AMG (rule 16 badge-aware halo, shared): true when the generic make-halo "amg" token
// would capture the car's OWN mainstream trim rather than a genuine halo above it. Two cases:
// (a) the MODEL NAME itself carries "amg" (SLS AMG, AMG GT) - every title has the word, so the
// make-halo would empty the whole pool. (b) R232 SL-CLASS 2022+ (URGENT, Oct 2026, SL-Class
// class-era leak root cause #2): Mercedes dropped the non-AMG SL500/SL550 base trim for this
// generation, so EVERY current SL43/SL55/SL63 sale carries "AMG" too, even though "SL-Class"
// itself does not say so. The older R230/R231 SL (2003-2020) kept a real non-AMG base trim, so
// this is scoped to an explicit year >= 2022 only - an unyeared or pre-2022 SL-Class query is
// unaffected and still sets the AMG halo aside correctly.
function intrinsicAmgFor(make, model, year) {
  if (!/mercedes|benz/i.test(String(make || ""))) return false;
  if (/\bamg\b/i.test(String(model || ""))) return true;
  // CLK DTM (Round 5 Lane B job, Oct 2026, confirmed live): every unit was AMG-built - there is no
  // non-AMG CLK DTM - so "AMG" (and "DTM" itself, also in the Mercedes HALO_PATTERNS token list) is
  // intrinsic to this car's own name, never a halo above it. Model field check, mirrors case (a).
  if (/\bdtm\b/i.test(String(model || ""))) return true;
  if (/^sl[\s-]*class$/i.test(String(model || "").trim()) && Number(year) >= 2022) return true;
  return false;
}
export { intrinsicAmgFor };

// Race cars and restomods: never a "stock market" comp, and never the record/max unless asked.
// Shared by One Box and the Sam Desk (one rule, not a Desk copy).
// "Clubsport" bare (no "GT4" prefix) is NOT a race signal: a 964-era "Carrera RS Clubsport"/"RS Club
// Sport" is a genuine FACTORY ROAD car (a lightweight RS variant), not the FIA GT4 Clubsport race car.
const RACE_TITLE_RE = /\bfia\b|\bimsa\b|\bnascar\b|\bgt3\s?cup\b|\bgt3[\s-]?r\b|\bgt4\s?clubsport\b|\bcup\s?car\b|\bsupercup\b|\b(turbo|carrera)\s?cup\b|\brsr\b|group\s?[abc45]\b|\brace\s?car\b|\btrack\s?car\b|\bracing\b|works\s?rally|rally\s?car|\bgrp\.?\s?[abc45]\b|competition\s?(saloon|coupe|car)/i;
// DTM (Round 5 Lane B job, Oct 2026, CLK DTM fix): split out of RACE_TITLE_RE above - "DTM" is BOTH
// a genuine racing-series indicator (an actual ex-DTM race car) AND, for one specific factory model
// (Mercedes-Benz CLK DTM / CLK DTM AMG), the car's OWN NAME - a real, retail, street-legal
// homologation special named after the racing series it commemorates. Confirmed live: every one of
// 13 genuine "20XX Mercedes-Benz CLK DTM AMG Cabriolet/Coupe" retail sales in the archive was being
// excluded as "race car" on this token alone, leaving 0 kept rows for a car with real retail sales.
// The intrinsic-name case is suppressed via the SAME opts.self pattern the halo check below already
// uses (self carries the queried model+trim); a genuinely race-flavored CLK DTM listing (Chassis
// no., Prototype, Competition Saloon) still gets excluded via RACE_TITLE_RE's OTHER alternatives
// (competition saloon is its own pattern there), so this narrows, never removes, the exclusion.
const DTM_RACE_RE = /\bdtm\b/i;
// An RSR-SPEC ENGINE SWAP ("RSR 3.8-Powered ... Carrera RS Clubsport") describes a part, not the car's
// own designation - strip it before testing RACE_TITLE_RE so the host car (a real road-car trim) is
// not misread as an RSR race car.
const RSR_POWERED_RE = /\brsr\b[\s\d.]*-?\s*powered\b/ig;
// Paint/trim names using the bare word "racing" are not a race-car signal: "British Racing Green",
// "Racing Stripes", "Racing Seats", "Racing Wheels" (were hiding ordinary cars from every comp pool,
// Oct 2026 - Lane C found the same false-positive on the live-listings specials flag first).
const RACING_PAINT_RE = /\b(british\s+|french\s+|italian\s+)?racing\s+(green|blue|red|yellow|white|silver|stripes?|seats?|wheels?)\b/gi;
// Single shared noise-strip before any RACE_TITLE_RE test, used by recordExcludeReason, qualifyReason
// and (via recordExcludeReason) the live-listings specialFlag - one rule, every caller.
const stripRaceNoise = t => String(t || "")
  .replace(RSR_POWERED_RE, "")
  .replace(RACING_PAINT_RE, " ")
  .replace(/\bford\s+racing\s+puma\b/gi, "Ford Puma")
  .replace(/\b(fiat\s+)?131\s+racing\b/gi, "131");
const RESTOMOD_TITLE_RE = /restomod|resto-?mod|reimagined|enhanced\s?&\s?evolved|coyote-?power|\bls[0-9]-?(swap|power|powered)|by\s?(singer|redux|kaege|g[uü]nther\s?werks|guntherwerks|emory|icon|ringbrothers|ring\s?brothers|speedkore|ecd|velocity|vintage\s?broncos|heritage|gateway\s?bronco|legacy)\b/i;
// Period TUNER / conversion houses: a converted car, not a stock example, so set aside on both
// surfaces. These MODIFY a base car. Separate MANUFACTURERS with their own VIN/type approval
// (Alpina, RUF) are their OWN cars, NOT conversions, so they are deliberately excluded here.
const TUNER_TITLE_RE = /\b(ac\s?schnitzer|schnitzer|hartge|hamann|dinan|brabus|renntech|lorinser|techart|gemballa|koenig\s?special|\bmtm\b|g[-\s]?power|manhart|hennessey|lingenfelter|roush|saleen|callaway)\b/i;
// MODIFIED / engine-swapped cars: not a stock comp for a base-market read. Conservative set catches
// clear aftermarket work in the TITLE (twin-turbo/supercharger swaps, engine swaps, pro-touring,
// widebody, "modified"/"custom-built") without matching a factory-turbo model name or a trim called
// "Custom" (e.g. "Ramcharger Custom" is a trim, not a mod, so \bcustom\b alone is NOT matched).
const MODIFIED_TITLE_RE = /\btwin[-\s]?turbo(charged)?\b|\b(v6|v8|v10|v12|ls\d|hemi|coyote|barra|2jz|rb2[56])[-\s]?swap(ped)?\b|\bengine[-\s]?swap(ped)?\b|\bpro[-\s]?touring\b|\bwide[-\s]?body\b|\brestomod(ded)?\b|\bmodified\b|\bcustom[-\s]?built\b|\bbagged\b|\bslammed\b/i;
// Coarse body CLASS (truck/utility vs car) for the class-era wider-market read: a pickup query must
// not pool passenger cars (a Shelby CSX, an Omni GLH-S) and vice versa. Returns "truck" for
// pickups/SUVs/vans (body-on-frame utility), else "car". Keyword-based on the title/model text.
// URGENT fix (Oct 2026, SL-Class class-era leak): this fence only caught the literal words "van"/
// "suv"/"g-wagen" - a title that names its SUV/van by BADGE rather than those words (a G580/G550/
// G63 G-Class, a GLE/GLS/GLC/GLA/GLB/GLK/ML-badged SUV, a Sprinter van with no "van" in the
// title) slipped through as "car" and pooled with an open-top sports car's class-era read
// (confirmed live: "2025 Mercedes-Benz G580 Edition One", "2021 Mercedes-Benz Sprinter 3500" both
// matched "car" against the 2023 SL-Class subject). Added the numeric-badge SUV families (same
// badges lib/modelFamilies.js already curates for the SAME marque) and sprinter/metris van names.
const TRUCK_CLASS_RE = /\bpick[-\s]?up\b|\btruck\b|\b[dwf][-\s]?[1-5]50\b|\bc\/?k[-\s]?[0-9]{3,4}\b|\bram\b|ramcharger|power\s?wagon|dakota|\bd50\b|\bd350\b|silverado|sierra|blazer|bronco|suburban|tahoe|yukon|wagoneer|cherokee|\bscout\b|land\s?cruiser|4[-\s]?runner|tacoma|tundra|\bk5\b|sport\s?utility|\bsuv\b|\bvan\b|econoline|\bg[-\s]?wagen\b|defender|\bfj\d|\bsprinter\b|\bmetris\b|\bg\s?\d{2,3}\b|\bgl[aekcs]?\s?\d{2,3}\b|\bml\s?\d{2,3}\b/i;
function bodyClassOf(text) { return TRUCK_CLASS_RE.test(String(text || "")) ? "truck" : "car"; }
export { bodyClassOf };
// Reason a title should be SET ASIDE from a stock answer (record, max, medians, the whole band):
// a make halo, a race car, a restomod, or a period tuner conversion. Returns the reason or null.
// Accepts a row (preferred: carries year for generation-aware calls) or a bare title string.
// wantHalo (the query names the halo/generation/trim) keeps halos in but still drops race cars,
// restomods and tuners. Generation-aware: on the BMW M3, "Evolution"/"Evo"/"Evo II" is a homolog-
// ation special on the E30 (<=1991) but the MAINSTREAM road car on the E36+ (1992+).
export function recordExcludeReason(rowOrTitle, make, opts = {}) {
  const t = typeof rowOrTitle === "string" ? rowOrTitle : String((rowOrTitle && (rowOrTitle.raw_title || rowOrTitle.title)) || "");
  const yr = (typeof rowOrTitle === "object" && rowOrTitle && Number(rowOrTitle.year)) ||
    (t.match(/\b(19|20)\d\d\b/) ? Number(t.match(/\b(19|20)\d\d\b/)[0]) : null);
  if (RACE_TITLE_RE.test(stripRaceNoise(t))) return "race car";
  // DTM: self-aware, same suppression technique as the halo check below - never exclude the
  // queried car's OWN name (CLK DTM) as a race car just because it carries the token.
  if (DTM_RACE_RE.test(t) && !(opts.self && DTM_RACE_RE.test(String(opts.self)))) return "race car";
  if (RESTOMOD_TITLE_RE.test(t)) return "restomod";
  if (TUNER_TITLE_RE.test(t)) return "period tuner";
  if (!opts.wantHalo) {
    // Generation-aware E30 M3 Evolution (homologation special); E36+ Evolution is mainstream.
    if (/bmw/i.test(make) && /\bm3\b/i.test(t) && yr && yr >= 1986 && yr <= 1991 && /\bevo(lution)?\b|\bevo\s?ii\b/i.test(t)) return "halo";
    const h = haloMatcherFor(make);
    // When the QUERIED car's own name matches the halo pattern (a "550 Barchetta" query, a "GT3" query),
    // the row is the queried car itself, not a halo variant to set aside - suppressing would otherwise
    // gut the pool (rule 16). opts.self carries the queried model+trim.
    if (h && h.test(t) && !(opts.self && h.test(String(opts.self).toLowerCase()))) return "halo";
  }
  return null;
}
// Nameplates where DROPPING the trim to "read other {model}s" blends genuinely DISTINCT models,
// not trims of one car (#2, Sep 2026). Ferrari's per-cylinder-displacement series each name
// several coachbuilt-distinct cars sharing one number (365 GTB/4 Daytona vs 365 GT 2+2 vs
// 365 GTC/4; 250 GTO vs 250 GT 2+2; etc.), and the Viper's RT/10 roadster, GTS coupe and ACR
// track special span too far to pool as one. A title/model-token family pool has NO clean
// sub-model fence for these, so a thin TRIM pool must NOT widen into the family - it routes to
// the honest span-without-cluster (or refusal) state on the trim's own sales instead of blending.
// Leading-number match (not anchored end) so the archive's "250 GT" / "330 GT" model-token
// forms are caught as well as a bare "365". No single-model Ferrari nameplate starts with any
// of these displacement numbers, so the leading-\b match cannot mis-fence a legitimate model.
const NO_FAMILY_WIDEN = [
  { make: /ferrari/i, model: /^(250|275|330|365|512)\b/i },
  { make: /dodge/i, model: /^viper$/i }
];
function blendsAcrossModels(spec) {
  return NO_FAMILY_WIDEN.some(g => g.make.test(spec.make || "") && g.model.test(String(spec.model || "").trim()));
}
const titleOf = r => String(r.raw_title || r.rtitle || "");
function familyWideningSentence(trimLabel, model, isHalo) {
  const m = model || "car";
  return isHalo
    ? `No recent ${trimLabel} sales, so this reads other ${m}s. The ${trimLabel} has sat above these when they trade.`
    : `Too few recent ${trimLabel} sales on their own, so this reads other ${m}s.`;
}
// The trim label a widening sentence names: prefix the model when the trim alone is ambiguous
// ("Competition" -> "M4 Competition"), leave it when it already carries the model.
function wideningTrimLabel(model, trim) {
  const t = String(trim || "").trim(), m = String(model || "").trim();
  if (!t) return m;
  return t.toLowerCase().indexOf(m.toLowerCase()) === 0 ? t : (m + " " + t);
}
// A pool can carry an honest range: enough sales, and not two genuinely different markets
// (extreme robust ratio, or a wide-year multi-variant nameplate). Mirrors buildResult's gates.
function presentable(rows, min) {
  if (!rows || rows.length < (min || 4)) return false;
  const u = rows.map(r => r._usd);
  const p75 = percentile(u, 0.75), p25 = percentile(u, 0.25);
  const solid = rows.filter(r => !(r._usd > p75 * 1.5 || r._usd < p25 * 0.4));
  if (solid.length < 4) return false;
  const su = solid.map(r => r._usd);
  const ratio = solid.length >= 6 ? percentile(su, 0.9) / Math.max(1, percentile(su, 0.1)) : Math.max(...su) / Math.max(1, Math.min(...su));
  if (ratio > 6) return false;
  const yrs = solid.map(r => Number(r.year)).filter(Boolean), yspan = yrs.length ? Math.max(...yrs) - Math.min(...yrs) : 0;
  if (yspan >= 15 && variantTokens(solid).length >= 2 && ratio > 2.5) return false;
  return true;
}
const miOf = r => Number(String(r.mileage == null ? "" : r.mileage).replace(/[^\d]/g, "")) || 0;
function shapeCards(rows) {
  return rows.map(r => ({
    // id (Round 6 Job 1, tracking fix): the record's own id, already on every row fetched - exposed
    // here so Lane A's receipt_opened can carry the real sale, never the platform slug it was
    // wrongly sending as sale_id. Nothing computed, nothing decided, just passed through.
    id: r.id != null ? r.id : null,
    country: r.country || null, countryBasis: r.countryBasis || null,
    // vinNorm (Lane B job, Oct 2026, Part 5, FOR LANE A): the record's own vin_norm, already on every
    // row fetched, same passthrough discipline as id just above - nothing computed, nothing decided.
    // hasHistoryPage (set separately by attachHistoryPage, "result"-tier cards only today) is the
    // boolean that actually says whether /history/.../<vin> is indexable right now; vinNorm alone is
    // not enough to link safely (see attachHistoryPage's own comment for the exact index rule).
    vinNorm: r.vin_norm || null,
    // make/model (Part 4 golden-cars job, Oct 2026): the row's OWN archive columns, passed through
    // unchanged - structured identity, never derived from the (often inconsistently spelled/spaced)
    // display title. FOR LANE A: available if a card ever needs to verify its own identity client-side.
    make: r.make || null, model: r.model || null,
    price: r._usd, mi: miOf(r), mileageText: miText(r), platform: platNamed(r.source), platformSlug: platSlug(r.source),
    // platformName (e50, Lane C's find): the venue's display name for EVERY source (Sotheby's Motorsport, Mecum,
    // Bonhams...), where `platform` names only the four online platforms and reads "others" for the rest, so a Task
    // email's "View the sale" row never prints with no venue.
    platformName: platformName(platSlug(r.source)) || null,
    date: r.auction_end_date || null, month: monthYear(r.auction_end_date), transmission: r.transmission || null,
    title: humanTitle(titleOf(r).replace(/[–—]/g, "-").replace(/\s+/g, " ").trim()), image: r.image || null, url: r.srcurl || r.srcurl2 || null, hollow: !!r._hollow
  }));
}
// LAST THREE, distinct cars (Oct 2026, one engine rule): the same physical car resold shows up as two+
// rows in the pool (same title, same stated mileage), so a naive "3 most recent" can show one car twice
// or three times. Same-car key = title (lowercased, alnum-collapsed) + mileage rounded to the nearest
// 500 - a resale lists with the same stated odometer almost always, and a genuinely different car at
// the same title+mileage band is vanishingly rare. A card with no mileage is never deduped against
// another (null key), so it is always treated as its own car - safer than a false merge. Mirrors
// lib/live/search.js's sameCarKey/lastThree (Buy's own mini-panel), now available to every consumer
// that reads a tier's `cards` directly, not just Buy's wrapper. Newest first; a repeat is tagged
// `again: true` rather than silently dropped, so the copy can say "same car, sold again" instead of
// presenting it as a second distinct sale.
function sameCardKey(c) { const mi = Number(c && c.mi) || 0; return mi > 0 ? String((c && c.title) || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + "|" + Math.round(mi / 500) : null; }
function lastThreeDistinct(cards, n = 3) {
  const sorted = (cards || []).slice().sort((a, b) => String((b && b.date) || "").localeCompare(String((a && a.date) || "")));
  const seen = new Set(), pick = [], again = [];
  for (const c of sorted) {
    const k = sameCardKey(c);
    if (k && seen.has(k)) { again.push(c); continue; }
    if (k) seen.add(k);
    if (pick.length < n) pick.push(c);
  }
  for (const c of again) { if (pick.length >= n) break; pick.push(c); }
  const out = pick.slice().sort((a, b) => String((a && a.date) || "").localeCompare(String((b && b.date) || "")));
  const had = new Set();
  for (const c of out) { const k = sameCardKey(c); if (k && had.has(k)) c.again = true; if (k) had.add(k); }
  return out;
}
// Thin/class-era pool rows carry _allin (outcomeUsd), not _usd (the result-tier pipeline's field name
// for the same all-in figure) - stamp it so shapeCards reads a real price instead of undefined.
const withUsd = rows => rows.map(r => (r._usd != null ? r : { ...r, _usd: r._allin }));
// ---- Round-4 statistics: today-first windows, direction, spread driver, pool-relative
// mileage buckets, transmission gate. Counts never leave here as rendered facts. ----
const R4_SPECIAL = /sport\s?evolution|cecotto|ravaglia|europameister|\bevo\b|\bcsl\b|clubsport|black\s?series|speciale|superveloce|\bsvj?\b|scuderia|pista|\btdf\b|z06|zr1|zl1|\bcs\b|shelby|gt500|gt350|gt3\s?rs|gt2\s?rs|hellcat|demon/i;
// PROVENANCE SET-ASIDE (Part 3 bug 3): a car whose VALUE is driven by WHO owned it or WHAT it did
// (ex-celebrity, works/team car, period press or show car) is a halo - it never belongs in the
// typical range or the side cards. Curated famous names + unambiguous phrases only, so an ordinary
// listing is never swept in. Matched on the title (the lean pool fetch carries no description).
const PROVENANCE_RE = /\bex[-\s–—]?works\b|\bworks\s+(car|racer|race\s?car|entry|team\s+car|prototype)\b|\bteam\s+car\b|\bpress\s+car\b|\bshow\s+car\b|\bfactory\s+(press|demonstrator|show)\b|\bformerly\s+owned\s+by\b|\bowned\s+by\s+[A-Z]/i;
// Distinctive famous-owner NAMES that mark provenance on their own (no "ex-" required): "Jerry
// Seinfeld's 911S", "Ex–Jerry Seinfeld Beetle" (en-dash), "the McQueen Ferrari" all qualify. Curated to
// names that only ever appear as provenance in a sale title, so an ordinary listing is never swept in.
const PROVENANCE_NAME_RE = /\b(seinfeld|mcqueen|paul\s?newman|ralph\s?lauren|nick\s?mason|jay\s?leno|james\s?dean|james\s?hunt|clark\s?gable|elvis\s?presley|steve\s?mcqueen|jerry\s?seinfeld)\b/i;
// Provenance from the title OR the DESCRIPTION (bug 3 completion): the ex-owner / works-car line
// usually lives in the description, which filterProjectRows already fetches into _descText on the same
// bounded pass as the project flag. So a description-only "ex-Steve McQueen" is now caught too.
const _provText = r => titleOf(r) + " " + String(r.rtitle || "") + " " + String(r._descText || "");
const isProvenance = r => { const t = _provText(r); return PROVENANCE_RE.test(t) || PROVENANCE_NAME_RE.test(t); };
// MODIFIED / ENGINE SWAP (set aside like a restomod): ONE shared list, lib/modelRules.js
// RESTOMOD_TAGS via restomodReason (comparable-fences job, Oct 2026 - this used to be a second,
// narrower local regex here, duplicating and drifting from RESTOMOD_TAGS; removed in favor of the one
// list). Covers the uncovered-model (r4Split) and thin paths; covered models are already tagged via
// rule5PoolGuard. Returns the matched word (truthy) or null, so a caller that wants the reason string
// for tagging can read it directly instead of re-deriving it.
// Title and description passed SEPARATELY (description-match job, Oct 2026): restomodReason only
// checks description text for its short, unambiguous word list (engine swap, restomod, crate
// engine, backdated, stroker) - the bare "modified"/"modded" and every other tag are title-only now,
// so they must never see description text at all (previously-concatenated _provText would have let
// a buried, trivial description mention still fire them).
const isEngineSwap = (r, make, model) => restomodReason(titleOf(r) + " " + String(r.rtitle || ""), make, model, String(r._descText || ""));
// MODEL-SPECIFIC HALOS (Part 3 bug 6): a pricier sub-variant that is NOT a named trim and would blow
// out an otherwise-coherent range. 300SL: the alloy-body Gullwings (29 built, $5M+) and the race cars
// (W194 / Rennsport / SLR) are halos, so the steel Gullwing pool reads as one market. Make+model
// scoped so "alloy"/"competition" never over-match another car.
const MODEL_HALOS = [
  { make: /mercedes|benz/i, model: /300\s?sl/i, re: /\balloy\b|alumin[iu]um|\bnsl\b|rennsport|\bw194\b|\bslr\b|competition/i }
];
function modelHaloReFor(make, model) { const h = MODEL_HALOS.find(x => x.make.test(make || "") && x.model.test(model || "")); return h ? h.re : null; }
function r4Split(rows, keepAll) {
  // Two-pass: drop named collector specials, fence the remaining driver market at p75*1.35.
  // keepAll = the pool IS the special (an exact-trim GT3 RS / Z06 / Shelby query), so the title
  // set-aside must NOT fire (it would set aside the very cars being priced); price fence only.
  const noSpecial = keepAll ? rows : rows.filter(r => !R4_SPECIAL.test(titleOf(r)));
  const p75 = percentile(noSpecial.map(r => r._usd), 0.75);
  const off = r => (!keepAll && R4_SPECIAL.test(titleOf(r))) || r._usd > p75 * 1.35;
  return { solid: rows.filter(r => !off(r)), aside: rows.filter(off) };
}
// Span outlier trim (Sep 2026, method review #1): on a DENSE pool (>=20 sales), drop a LONE
// LOW endpoint whose gap to the next sale exceeds 3x the pool's median inter-sale gap - a
// single damaged/non-running/mispriced car that misrepresents the floor. Highs are NEVER
// trimmed (a lone high is a genuine ceiling). Thin pools (<20) are not trimmed here - they
// land on the span-without-cluster state instead. Groups of low sales (gap <= 3x median)
// are genuine spread and stay.
// "Everything from X to Y has sold" must literally contain EVERY sale the card shows. Round the low
// DOWN and the high UP (never nearest, which put $18,888 above a stated $19,000 low and $93,700 above
// a stated $93,500 high), and DO NOT trim - "everything" means the true min to the true max of the
// pool the card summarizes. The typical band (r4Cluster, p25-p75) carries the "sold between" read.
const floor500 = n => Math.floor(n / 500) * 500;
const ceil500 = n => Math.ceil(n / 500) * 500;
const r4Span = a => {
  const v = a.map(r => r._usd).filter(x => x > 0).sort((x, y) => x - y);
  if (!v.length) return [0, 0];
  return [roundFloor(v[0]), roundCeil(v[v.length - 1])];
};
const r4Cluster = a => a.length ? [roundNearest(percentile(a.map(r => r._usd), 0.25)), roundNearest(percentile(a.map(r => r._usd), 0.75))] : null;
// Capped-third-split range (Part 3 question cap): each side's $500-rounded TYPICAL band (p25-p75),
// the same "sold between" basis as the main result so a lone outlier never inflates it (a single
// $541k manual F355 must not read as "Manuals sold between $70,500 and $541,000"). Returns null if
// either side is too thin (<3) to state. Renders "Manuals sold between X and Y. F1s between X and Y."
// SPLIT_MIN (job 5, thin-pool minimums, Oct 2026): the floor for ANY split (trim, gearbox, mileage) to
// carry a range at all - below this, the split renders nothing (same as every other engine gate: an
// absent field, never a guessed range). THIN_MIN is the richer bar a rendered split must ALSO clear to
// be called confident rather than thin - reuses RANGE_THRESHOLD (8), the same bar the over-time block
// and Sam's Take already use, so "thin" means the same thing everywhere in this engine, not a fourth
// number. See docs/lane-notes.md for the full minimums table.
const SPLIT_MIN = 3;
// splitMaterial (Round 4 Job 3, Oct 2026; predicate replaced Round 5 Job 2, Oct 2026): the ONE
// shared materiality predicate every split dimension (trim, gearbox, competition/variant, body,
// documented history) calls, replacing four ad hoc gates that each invented their own threshold
// (gearbox: a hardcoded 5/5 count; competition: 3/3 count PLUS an unrelated 25%-of-pool share;
// trim/body: SPLIT_MIN-or-coverage count floors) with NO price-magnitude check anywhere.
//
// ROUND 5 JOB 2: the ratio test below (gapRatio >= OB_BAND_WIDE, 40% of the lower median) is
// RETIRED. Percentages/ratios are no longer the measure. A dimension is material only when BOTH
// sides clear SPLIT_MIN(3) solid sales AND their price bands genuinely do not overlap: the LOWER
// side's own upper quartile (p75, the top of its middle half) sits BELOW the HIGHER side's own
// lower quartile (p25, the bottom of its middle half). This is a strict no-overlap test on the two
// actual middle-half bands, not a ratio of two single medians - two dimensions can have medians
// 17% apart yet still fail this test (their bands overlap heavily) or medians only 10% apart yet
// PASS it (if both bands happen to be tight and sit cleanly apart). OB_BAND_WIDE/the ratio test is
// kept for its OTHER, unrelated caller (the driver-search wide-band check below) - only this
// function's own use of it is gone.
function splitMaterial(pricesA, pricesB) {
  if (!Array.isArray(pricesA) || !Array.isArray(pricesB) || pricesA.length < SPLIT_MIN || pricesB.length < SPLIT_MIN) return { material: false, medianA: null, medianB: null, lowerQ75: null, higherQ25: null };
  const medianA = percentile(pricesA, 0.5), medianB = percentile(pricesB, 0.5);
  // Which side is "lower" is decided by MEDIAN (a stable single-number ordering); the actual test
  // then compares QUARTILES, not medians - the lower side must clear out of the higher side's
  // bottom quarter entirely, not just have a lower typical value.
  const aIsLower = medianA <= medianB;
  const lowerPrices = aIsLower ? pricesA : pricesB, higherPrices = aIsLower ? pricesB : pricesA;
  const lowerQ75 = percentile(lowerPrices, 0.75), higherQ25 = percentile(higherPrices, 0.25);
  return { material: lowerQ75 < higherQ25, medianA, medianB, lowerQ75, higherQ25 };
}
export { splitMaterial };
function inlineSplitRange(rows, classify, aKey, aLabel, bKey, bLabel) {
  const vals = key => rows.filter(r => classify(r) === key).map(r => r._usd).filter(v => Number.isFinite(v) && v > 0).sort((x, y) => x - y);
  const a = vals(aKey), b = vals(bKey);
  if (a.length < SPLIT_MIN || b.length < SPLIT_MIN) return null;
  const band = v => [roundNearest(percentile(v, 0.25)), roundNearest(percentile(v, 0.75))];
  const [alo, ahi] = band(a), [blo, bhi] = band(b);
  return [{ label: aLabel, lo: alo, hi: ahi, n: a.length, thin: a.length < RANGE_THRESHOLD },
          { label: bLabel, lo: blo, hi: bhi, n: b.length, thin: b.length < RANGE_THRESHOLD }];
}
function r4Driver(solid) {
  const tp = percentile(solid.map(r => r._usd), 0.75), bp = percentile(solid.map(r => r._usd), 0.25);
  const top = solid.filter(r => r._usd >= tp && miOf(r) > 0), bot = solid.filter(r => r._usd <= bp && miOf(r) > 0);
  const avg = a => a.length ? a.reduce((s, r) => s + miOf(r), 0) / a.length : 0;
  return (top.length >= 5 && bot.length >= 5 && avg(top) < avg(bot) * 0.75) ? "mileage" : null;
}
function r4Direction(recent, prior, keepAll) {
  const rs = r4Split(recent, keepAll).solid, ps = r4Split(prior, keepAll).solid;
  if (rs.length < 8 || ps.length < 8) return null;
  const rc = r4Cluster(rs), pc = r4Cluster(ps), rm = (rc[0] + rc[1]) / 2, pm = (pc[0] + pc[1]) / 2, diff = (rm - pm) / pm;
  return { word: diff > 0.04 ? "a touch firmer" : diff < -0.04 ? "a touch softer" : "about level", prior: pc };
}
function r4Buckets(solid) {
  const mi = solid.map(miOf).filter(v => v > 0).sort((a, b) => a - b);
  if (mi.length < 8) return null;
  const step = (percentile(mi, 0.9) - percentile(mi, 0.1)) > 120000 ? 20000 : 10000;
  const rnd = n => Math.max(step, Math.round(n / step) * step);
  const cuts = [rnd(percentile(mi, 0.25)), rnd(percentile(mi, 0.5)), rnd(percentile(mi, 0.75))].filter((v, i, a) => a.indexOf(v) === i);
  const kf = n => (n % 1000 === 0 ? (n / 1000) : (n / 1000).toFixed(1)) + "k";
  const out = [{ label: "under " + kf(cuts[0]), min: 0, max: cuts[0] }];
  for (let i = 1; i < cuts.length; i++) out.push({ label: kf(cuts[i - 1]) + " to " + kf(cuts[i]), min: cuts[i - 1], max: cuts[i] });
  out.push({ label: "over " + kf(cuts[cuts.length - 1]), min: cuts[cuts.length - 1], max: null });
  return out.filter(bk => { const n = solid.filter(r => { const m = miOf(r); return m > 0 && m >= bk.min && (bk.max == null || m < bk.max); }).length; return n > 0 && n < mi.length; });
}
// Paddle/automated boxes are AUTO, never manual. The list mirrors gearboxType (Part 1) so a
// dual-clutch / F1 / E-Gear / SMG / Sportshift / PDK / DCT car is never mistaken for a manual.
// (Bug: a "7-Speed Dual-Clutch" / "7-Speed F1" 458 Speciale matched the bare-N-speed manual rule and
// its old exclusion list missed those spelled-out tokens, inventing >=5 phantom "manuals" and firing
// a Manual/Automatic question for a car that has no manual at all.)
const R4_AUTO = t => /automatic|\bpdk\b|\bdct\b|tiptronic|\bdsg\b|paddle|dual[-\s]?clutch|twin[-\s]?clutch|\bf1\b|e-?gear|\bsmg\b|sportshift|automated|s[-\s]?tronic|\btct\b|f1[-\s]?matic|semi-?auto/i.test(t);
// Manual needs a manual marker (explicit, or a bare N-speed for the F1-era cars titled only "6-Speed")
// AND no auto marker. The !R4_AUTO guard is what keeps paddle boxes out of the manual bucket.
// Manual requires a POSITIVE marker (manual / stick / gated / MT / "N-speed manual"); a BARE "N-speed"
// is UNKNOWN, never manual (a 458's "7-Speed" is a dual-clutch, not a stick). Unknown rows count on
// NEITHER side of a transmission split or question. (Rule, Oct 2026: applies everywhere transmission
// splits a pool - r4Transmission, the driver search, the inline split, the gearbox question.)
const R4_MANUAL = t => /\bmanual\b|\bgated\b|\bstick\b|\bmt\b/i.test(t) && !R4_AUTO(t);
function r4Transmission(solid, make) {
  const man = solid.filter(r => R4_MANUAL(String(r.transmission || ""))), aut = solid.filter(r => R4_AUTO(String(r.transmission || "")));
  if (man.length < 5 || aut.length < 5) return null;
  const auto = /porsche/i.test(make || "") ? (aut.filter(r => /pdk/i.test(String(r.transmission || ""))).length >= aut.length / 2 ? "PDK" : "Tiptronic") : "automatic";
  // gap = |median manual price - median auto price|, for the earned-question priority (#3).
  const gap = Math.abs(percentile(man.map(r => r._usd), 0.5) - percentile(aut.map(r => r._usd), 0.5));
  return { manual: "manual", auto, gap };
}
// Median-price gap between the low-mileage and high-mileage halves of the pool (#3): the
// size of the mileage split, to compare against the transmission split.
function r4MileageGap(solid) {
  const withMi = solid.filter(r => miOf(r) > 0);
  if (withMi.length < 10) return null;
  const miMed = percentile(withMi.map(miOf), 0.5);
  const lo = withMi.filter(r => miOf(r) <= miMed).map(r => r._usd), hi = withMi.filter(r => miOf(r) > miMed).map(r => r._usd);
  if (lo.length < 5 || hi.length < 5) return null;
  return Math.abs(percentile(lo, 0.5) - percentile(hi, 0.5));
}
// Item 7: the driver search. The band is "wide" when the q25-q75 cluster spans > 40% of the
// median. On a wide band, test each candidate FACT (mileage split at the median, gearbox, and any
// dictionary title-flag for this model family) by splitting the pool and measuring how much the
// cluster band tightens; the winner (5+ on each side) becomes the second question. If nothing
// clears 5+/5+, no question renders and the block gets one honest sentence. On a TIGHT band the
// caller asks mileage as before. Never forces a driver question for a model with no dictionary
// entry, and never crashes on a model outside the five families.
const OB_BAND_WIDE = 0.40;
// Text a dictionary flag is mined from: the short title always, plus the listing description WHEN
// it has been attached (the item-7 bounded second fetch). Provenance phrases ("matching numbers",
// "Classiche", "documented") live in the description, not the short online title.
function dtext(r) { return String(titleOf(r) || "") + " " + String((r && r._descText) || ""); }
// Fetch descriptions for JUST this pool's records and attach them, so the dictionary can mine
// title+description. Bounded (the landed pool, ~8-30 rows), one query, id-keyed. Returns the ms
// spent (for the latency budget) or null on failure - the caller keeps the title-only result.
// e59: known_flaws and recent_service_history for the CHOSEN rows (solid and set-aside alike, one id IN read per 200
// rows), attached as r.flaws / r.svc exactly as the pool read used to carry them. Idempotent per row (r._xtra).
async function obEnrichExtras(chosen, env, diag) {
  const rows = (chosen && chosen.rows || []).filter(r => r && r.id != null && !r._xtra);
  if (!rows.length) return null;
  const t0 = Date.now();
  try {
    const byId = {};
    for (let i = 0; i < rows.length; i += 200) {
      const ids = rows.slice(i, i + 200).map(r => r.id);
      const got = (await supabaseSelect(env, `sales_archive?id=in.(${ids.join(",")})&select=id,flaws:raw_record->>known_flaws,svc:raw_record->>recent_service_history`)) || [];
      for (const g of got) byId[g.id] = g;
    }
    let n = 0;
    for (const r of rows) { const g = byId[r.id]; r._xtra = true; if (g) { r.flaws = g.flaws ?? null; r.svc = g.svc ?? null; n++; } }
    const ms = Date.now() - t0; if (diag) { diag.xtraFetchMs = (diag.xtraFetchMs || 0) + ms; diag.xtraEnriched = (diag.xtraEnriched || 0) + n; }
    return ms;
  } catch (e) { return null; }
}
async function obEnrichDescriptions(chosen, env, diag) {
  const ids = [...new Set((chosen.rows || []).map(r => r.id).filter(v => v != null))];
  if (!ids.length) return null;
  const t0 = Date.now();
  try {
    const rows = (await supabaseSelect(env, `sales_archive?id=in.(${ids.join(",")})&select=id,d:raw_record->>description`)) || [];
    const byId = {}; for (const dr of rows) byId[dr.id] = String(dr.d || "");
    let n = 0; for (const r of chosen.rows) { if (byId[r.id] != null) { r._descText = byId[r.id]; n++; } }
    const ms = Date.now() - t0; if (diag) { diag.descFetchMs = ms; diag.descEnriched = n; diag.descPoolSize = ids.length; }
    return ms;
  } catch (e) { return null; }
}
function bandWidthOf(rows) {
  if (!rows || rows.length < 5) return null;
  const us = rows.map(r => r._usd);
  const m = percentile(us, 0.5);
  return m > 0 ? (percentile(us, 0.75) - percentile(us, 0.25)) / m : null;
}
function r4DriverSearch(solid, cluster, vehicle) {
  const med = percentile(solid.map(r => r._usd), 0.5);
  if (!(med > 0) || !cluster) return { wideBand: false, candidates: [] };
  const fullBand = (cluster[1] - cluster[0]) / med;
  if (fullBand <= OB_BAND_WIDE) return { wideBand: false, candidates: [] };
  // tightening = how much the average of the two sides' band widths falls below the full band.
  const tighten = (a, b) => { const wa = bandWidthOf(a), wb = bandWidthOf(b); return (wa == null || wb == null) ? null : (fullBand - (wa + wb) / 2); };
  const candidates = [];
  const withMi = solid.filter(r => miOf(r) > 0);
  if (withMi.length >= 10) {
    const miMed = percentile(withMi.map(miOf), 0.5);
    const lo = withMi.filter(r => miOf(r) <= miMed), hi = withMi.filter(r => miOf(r) > miMed);
    if (lo.length >= 5 && hi.length >= 5) { const t = tighten(lo, hi); if (t != null) candidates.push({ kind: "mileage", tighten: t }); }
  }
  const man = solid.filter(r => R4_MANUAL(String(r.transmission || ""))), aut = solid.filter(r => R4_AUTO(String(r.transmission || "")));
  if (man.length >= 5 && aut.length >= 5) { const t = tighten(man, aut); if (t != null) candidates.push({ kind: "transmission", tighten: t }); }
  const dictDiag = [];
  for (const drv of driversForVehicle(vehicle)) {
    // Item 9 (Oct 15 2026): restoration is never a question that asks the owner to grade the car; it is a set-aside
    // reason handled by the variant-market rule (lib/modelRules.js VARIANT_MARKETS "restoration").
    if (/^restored$/i.test(String(drv.key || ""))) continue;
    const yes = solid.filter(r => drv.re.test(dtext(r))), no = solid.filter(r => !drv.re.test(dtext(r)));
    dictDiag.push({ key: drv.key, yes: yes.length, no: no.length });
    if (yes.length >= 5 && no.length >= 5) { const t = tighten(yes, no); if (t != null) candidates.push({ kind: "driver", driverKey: drv.key, tighten: t }); }
  }
  candidates.sort((a, z) => z.tighten - a.tighten);
  return { wideBand: true, candidates, best: candidates[0] || null, fullBand, dictDiag };
}

// The ROUND-4 result model: today-first window, folded Sam's-take facts, the earned question,
// inline refinement. Counts are never returned as rendered facts. Returns a result or refusal.
// #1 DIVERGENCE RULE (Sep 2026, locked rule set 17-19): when the exact car's OWN completed
// in-window sale falls materially (>10% beyond the nearer cluster edge) outside the displayed
// cluster, the result must never show the cluster as if that sale didn't exist. Classify:
//   a = a known attribute (mileage) explains the gap in the right direction -> state it as fact
//   b = we know it diverges but the explaining fact is missing (mileage null) -> ask for it
//   c = nothing in the data explains it -> caller loosens/withholds the Live Take
// Threshold locked at 10% (validated Sep 2026: ~25% fire on clean scoped pools = genuine tails).
function computeDivergence(exactSale, cluster, solid, winIsoDate) {
  if (!exactSale || !cluster) return null;
  const price = Number(exactSale.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const d = String(exactSale.soldDate || "").slice(0, 10);
  if (!d || d < winIsoDate) return null;                 // rule 1 applies to in-window sales only
  const lo = cluster[0], hi = cluster[1];
  const below = price < lo * 0.90, above = price > hi * 1.10;
  if (!below && !above) return null;                     // inside/near the cluster: no divergence
  const mi = Number(String(exactSale.mileage == null ? "" : exactSale.mileage).replace(/[^\d]/g, ""));
  const dir = below ? "below" : "above";
  const out = { price, soldDate: d, direction: dir, attr: "mileage" };
  if (!(mi > 0)) return { ...out, mileage: null, kase: "b" };   // missing the explaining fact
  out.mileage = mi;
  const poolMi = solid.map(r => miOf(r)).filter(n => n > 0).sort((a, b) => a - b);
  const medMi = poolMi.length ? poolMi[Math.floor(poolMi.length / 2)] : null;
  const explains = medMi != null && ((below && mi > medMi * 1.15) || (above && mi < medMi * 0.85));
  return explains ? { ...out, kase: "a", poolMedianMileage: medMi } : { ...out, kase: "c", attr: null, poolMedianMileage: medMi };
}
// The subject's own prior sale must never appear as a comp card (it lives in the exact-car
// block). Match by rounded price + sale date, the same identity the archive dedup uses.
function sameAsSubject(r, exactSale) {
  if (!exactSale) return false;
  const sp = Math.round(Number(exactSale.price) || 0); if (!(sp > 0)) return false;
  const sd = String(exactSale.soldDate || "").slice(0, 10), d = String(r.auction_end_date || "").slice(0, 10);
  return Math.round(r._usd) === sp && (!sd || !d || sd === d);
}
// Three REPRESENTATIVE sales for the render port (round 7): a closest match plus a high and a
// low bracket that GENUINELY bracket it - one meaningfully above its price, one meaningfully
// below. "Meaningfully" is data-derived (the pool's median inter-sale price gap, same basis as
// the span-outlier trim), never a guessed percentage: a bracket must sit at least one typical
// price step from the closest match, so a near-duplicate price ($30,480 next to $30,000) is
// NEVER surfaced as a "lower" sale. When no comp sits meaningfully below (the closest is already
// near the pool floor), only the high bracket renders - a single card, not a mislabelled one.
// Labels lead with the ATTRIBUTE that explains the gap (mileage, transmission, an older sale);
// a bare price-direction token (higher/lower) is only the fallback when nothing else does.
// Backend returns facts + delta TOKENS only; the render turns tokens into prose (rule 3).
// Two-sided robust price fence for pool contamination (Sep 2026). Halo highs (a $600k 964 Turbo
// bracketing a $126k base Carrera) and data-error lows (a $513 mis-priced 250F flooring a class
// band) are BOTH real records with real titles that the title/percentile filters miss - the gap
// is that nothing checks a record's price is PLAUSIBLE for its pool. This fences records whose
// price is an extreme multiple of the pool MEDIAN in either direction, applied to BOTH the bracket
// pool (pickRepresentative) and the class-era band (assessClassEra).
// Ratios locked from the before/after (Sam-approved, Sep 2026). BRACKETS use a SYMMETRIC 4x fence
// (median $116k 964 pool -> $29k/$464k: drops the $600k Turbo halo and the $9 data error, keeps
// ~91%). The CLASS band uses a LOW-SIDE-ONLY fence (OB_CLASS_LO) because it is legitimately $M-wide
// at the top - a high fence would trim genuine race cars, so only data-error lows are removed and
// the p10-p90 handles the top honestly.
const OB_OUTLIER_HI = 4;    // brackets: exclude a record priced > median * HI
const OB_OUTLIER_LO = 4;    // brackets: exclude a record priced < median / LO
const OB_CLASS_LO = 6;      // class band: LOW-SIDE only - exclude a record priced < median / OB_CLASS_LO
function _obMedian(nums) { const s = nums.filter(n => n > 0).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; }
function priceOutlierBounds(prices) { const m = _obMedian(prices); return m > 0 ? { med: m, hi: m * OB_OUTLIER_HI, lo: m / OB_OUTLIER_LO } : null; }

// CONTEXT-CARD YEAR WINDOW (Oct 2026): the searched car's year +/-1, clamped to whichever curated
// break actually applies so the window never crosses it - a half-generation's OWN bounds
// (halfForYear, e.g. 997.1 2005-2008) take priority when one pins the searched year; otherwise the
// resolved generation's bounds (spec.yearMin/yearMax, already set by buildSpec from
// CURATED_GENERATIONS, e.g. 3.2 Carrera 1984-1988) clamp it. An uncurated model/year gets the bare
// +/-1 window with nothing to clamp against. Null for a year-less search (searches without a year
// are unchanged, per the job). ONLY curated breaks are used here - never a guessed one (the 1987
// G50 gearbox change for 3.2 Carreras was NOT added: it has no entry in lib/generations.js, so using
// it would be inventing a break the engine does not actually curate).
function contextYearWindow(spec) {
  if (!spec || !spec.year) return null;
  let lo = spec.year - 1, hi = spec.year + 1;
  const hg = halfGenerationFor(spec.make, spec.model);
  const half = hg ? halfForYear(hg, spec.year) : null;
  if (half) { lo = Math.max(lo, half.yearStart); hi = Math.min(hi, half.yearEnd); }
  else if (Number.isFinite(spec.yearMin) && Number.isFinite(spec.yearMax)) { lo = Math.max(lo, spec.yearMin); hi = Math.min(hi, spec.yearMax); }
  return lo <= hi ? [lo, hi] : [spec.year, spec.year];
}
function pickRepresentative(solid, exactSale, center, driver, divergence, ownHalf, halfOfFn, yearWindow) {
  let comps = solid.filter(r => !sameAsSubject(r, exactSale));
  if (!comps.length) return null;
  // SAME-HALF PREFERENCE (Oct 2026, half-generation job): when the searched car's own half-
  // generation is known (997.1 vs 997.2, E46 M3 pre/post facelift, lib/generations.js
  // halfGenerationFor/halfForYear) and that half has at least 3 qualifying comps, scope the three
  // context cards to it alone - a 2008 997.1 search never shows a 2011 997.2 car as the middle-of-
  // range sale or a mileage bracket. Fewer than 3 same-half comps: the full (merged, cross-half)
  // pool stands exactly as before this change, and each returned card is tagged sameHalf so the
  // page can label a cross-half fill-in by its own generation/year instead of presenting it as the
  // subject's own half. Applies whether or not this model's CLUSTER is split (lib/onebox.js
  // buildSpec halfGenSplit) - a merged model (997, E46 M3) still gets same-half card preference.
  if (ownHalf && typeof halfOfFn === "function") {
    const sameHalf = comps.filter(r => halfOfFn(r) === ownHalf);
    if (sameHalf.length >= 3) comps = sameHalf;
  }
  // YEAR WINDOW PREFERENCE (context-cards job, Oct 2026): when the searched car has a year, prefer
  // comps from that year +/-1 (yearWindow, computed by contextYearWindow - already clamped to a
  // curated half-generation or generation boundary, so the window never crosses a known break).
  // Applied the SAME way sameHalf is: narrow `comps` when 3+ fit, otherwise leave the full pool
  // standing and let `shape()` below tag each resulting card as offWindow so the page can say so
  // ("a 1984 car") instead of presenting it as the searched year silently.
  let windowApplied = false;
  if (Array.isArray(yearWindow)) {
    const [lo, hi] = yearWindow;
    const w = comps.filter(r => { const y = Number(r.year); return y >= lo && y <= hi; });
    if (w.length >= 3) { comps = w; windowApplied = true; }
  }
  // Bracket pool with extreme price outliers fenced out (halo highs / data-error lows). closest
  // stays the subject/middle anchor computed over all comps; only high/low draw from the fenced set.
  const _ob = priceOutlierBounds(comps.map(r => r._usd));
  const bpool = _ob ? comps.filter(r => r._usd <= _ob.hi && r._usd >= _ob.lo) : comps;
  // band (moved up, job 4, trim-fence sweep, Oct 2026): the headline's own displayed range. Needed
  // now to CONSTRAIN the middle/"closest" card too (below), not only the high/low side cards.
  const band = (Array.isArray(center) && center.length === 2 && center[0] != null && center[1] != null)
    ? [Math.min(center[0], center[1]), Math.max(center[0], center[1])] : null;
  // Coherence fix (Sep 2026): normally "closest" anchors on the subject's mileage. But when the
  // subject DIVERGES from the cluster (it is atypical - here high-mileage), its nearest-mileage comp
  // is a pool EXTREME that lands OUTSIDE the headline band, so "CLOSEST MATCH" would contradict the
  // Live Take. In the divergence case, anchor "closest" on the cluster MIDDLE so the closest card
  // traces to the band; the subject's own atypical sale is carried by the divergence beat + refine.
  const subjMi = (exactSale && !divergence) ? (Number(String(exactSale.mileage == null ? "" : exactSale.mileage).replace(/[^\d]/g, "")) || 0) : 0;
  let closest = null;
  if (subjMi > 0) {
    // SUBJECT case: CLOSEST MATCH only ever renders here, where a real similarity calculation exists
    // (a genuine subject mileage from a VIN/chassis match or known exact sale) - job 4's own rule.
    const wm = comps.filter(r => miOf(r) > 0);
    closest = (wm.length ? wm : comps).slice().sort((a, b) => Math.abs(miOf(a) - subjMi) - Math.abs(miOf(b) - subjMi))[0];
  } else {
    // MIDDLE case (FIXED, job 4, trim-fence sweep, Oct 2026): the old anchor was the raw price MEDIAN
    // of `comps`, with no requirement that it fall inside the headline's own displayed range - `comps`
    // can legitimately be a narrower slice than the pool the range itself was built from (the same-
    // half/year-window preference above), so its median could land outside the range entirely
    // (confirmed live: a Cabriolet search's headline read $115,000 to $134,000 while its MIDDLE OF THE
    // RANGE card read $153,000). Sam's rule: the middle card must be a sale INSIDE the headline range,
    // nearest its midpoint; prefer one with pool sales on BOTH sides of it by mileage (when mileage is
    // known) so the fewer/more-miles side cards below have somewhere real to anchor; with no in-range
    // sale at all, no middle card renders - never a mislabelled one.
    const inRange = band ? bpool.filter(r => r._usd >= band[0] && r._usd <= band[1]) : bpool;
    if (inRange.length) {
      const midpoint = band ? (band[0] + band[1]) / 2 : inRange.reduce((s, r) => s + r._usd, 0) / inRange.length;
      const byMidpoint = (a, b) => Math.abs(a._usd - midpoint) - Math.abs(b._usd - midpoint);
      const hasBothSides = r => {
        const m = miOf(r);
        return m > 0 && bpool.some(x => x !== r && miOf(x) > 0 && miOf(x) < m) && bpool.some(x => x !== r && miOf(x) > 0 && miOf(x) > m);
      };
      const bracketed = inRange.filter(hasBothSides).sort(byMidpoint);
      closest = (bracketed.length ? bracketed : inRange.slice().sort(byMidpoint))[0];
    }
  }
  const cMi = closest ? miOf(closest) : 0;
  // OUTSIDE-RANGE FIELDS (job 4): the real lowest/highest sale in the candidate pool, and the sales
  // that sit below/above the headline range (count + the rows themselves, for a compact "N more below/
  // above" collapsed line) - never a second range, just the real sales outside this one.
  const byPriceAll = comps.length ? [...comps].sort((a, b) => a._usd - b._usd) : [];
  const lowestSale = byPriceAll.length ? shapeCards([byPriceAll[0]])[0] : null;
  const highestSale = byPriceAll.length ? shapeCards([byPriceAll[byPriceAll.length - 1]])[0] : null;
  const belowRangeRows = band ? comps.filter(r => r._usd < band[0]) : [];
  const aboveRangeRows = band ? comps.filter(r => r._usd > band[1]) : [];
  // SIDE CARDS (Part 3 item 2): BOTH drawn from INSIDE the displayed range, never a car priced
  // outside it (no $293k card beside a $132k-$161k band). `center` is the cluster band (or the span
  // for a no-cluster result). Within that band, prefer a FEWER-miles and a MORE-miles example vs the
  // closest; if a side has no in-band mileage example, fall back to the MORE-RECENT / EARLIER in-band
  // sale. Falling back stays strictly inside the band - an empty side renders one card, never an
  // out-of-range one.
  const inBand = (band ? bpool.filter(r => r._usd >= band[0] && r._usd <= band[1]) : bpool).filter(r => r !== closest);
  let high = null, hiDelta = null, low = null, loDelta = null;
  if (cMi > 0) {
    const fewer = inBand.filter(r => miOf(r) > 0 && miOf(r) < cMi).sort((a, b) => miOf(a) - miOf(b));   // lowest miles in band
    const more = inBand.filter(r => miOf(r) > 0 && miOf(r) > cMi).sort((a, b) => miOf(b) - miOf(a));    // highest miles in band
    if (fewer.length) { high = fewer[0]; hiDelta = "fewer_miles"; }
    if (more.length) { low = more[0]; loDelta = "more_miles"; }
  }
  // Recency fallback, strictly WITHIN the band, for any empty side (never a car outside the band).
  if (!high) { const d = inBand.filter(r => r !== low).sort((a, b) => String(b.auction_end_date || "").localeCompare(String(a.auction_end_date || ""))); if (d.length) { high = d[0]; hiDelta = "more_recent"; } }
  if (!low) { const d = inBand.filter(r => r !== high).sort((a, b) => String(a.auction_end_date || "").localeCompare(String(b.auction_end_date || ""))); if (d.length) { low = d[0]; loDelta = "earlier"; } }
  const shape = (r, role, dl, basis) => {
    if (!r) return null;
    const c = shapeCards([r])[0];
    const disp = priceDisplay(r), isH = isHouseSource(r.source);
    c.isHouse = isH;
    c.allIn = (isH && disp && disp.premiumInclusive && disp.amount) ? Math.round(disp.currency === "USD" ? disp.amount : toUsd(disp.amount, disp.currency, r.date || r.sale_date || r.auction_end_date || null)) : null;
    c.role = role; c.delta = dl || null; c.basis = basis || null;
    // sameHalf (half-generation job): null when this model has no half-generation table entry at
    // all (halfOfFn absent) - the page must only ever label a card when there is a real half to
    // compare against, never a guessed true/false.
    c.sameHalf = (ownHalf && typeof halfOfFn === "function") ? halfOfFn(r) === ownHalf : null;
    c.year = r.year || null;
    // offWindow (context-cards job, Oct 2026): null when no year window applied at all (a year-less
    // search, or this model/car has nothing to prefer against); false when the window was requested
    // AND satisfied (either this card sits inside it, or 3+ comps fit so the pool was narrowed to the
    // window and every card is inside by construction); true only on the full-pool fallback (fewer
    // than 3 comps fit the window) for a card whose OWN year actually falls outside it - the signal
    // Lane A uses to print a short label such as "a 1984 car" instead of presenting a fill-in as the
    // searched year.
    c.offWindow = Array.isArray(yearWindow) ? (!windowApplied && (Number(r.year) < yearWindow[0] || Number(r.year) > yearWindow[1])) : null;
    return c;
  };
  return {
    closest: shape(closest, "closest", null, subjMi > 0 ? "subject" : "middle"),
    high: high ? shape(high, "high", hiDelta, null) : null,
    low: low ? shape(low, "low", loDelta, null) : null,
    count: comps.length,
    yearWindowed: Array.isArray(yearWindow) ? windowApplied : null,
    // OUTSIDE-RANGE fields for Lane A (job 4): the real lowest/highest sale, and the count + rows
    // sitting below/above the headline range, for a compact collapsed line. Null/0 when there is no
    // band to measure against (a span-only result with no cluster).
    lowestSale, highestSale,
    belowRangeCount: belowRangeRows.length, aboveRangeCount: aboveRangeRows.length,
    belowRangeSales: shapeCards(belowRangeRows), aboveRangeSales: shapeCards(aboveRangeRows)
  };
}
// ---- THIN MODE + HOUSE STEER assessment (Sep 2026) ------------------------------------
// Two decoupled concerns (revised design):
//  1. THIN MODE (render): fires when the VOLUME-capable online count over the 36-month model pool
//     is < HT_ONLINE_MIN, REGARDLESS of house presence. Replaces the span-only "too few to mark a
//     band" state. Sale-anchored hero, ask-first intake ONLY from splits that fork THIS car's price
//     (config markers for vintage, mileage/transmission for modern), receipts with hammer + all-in.
//  2. HOUSE STEER (layer): only when house share >= 2/3 of the pool. Then "these mostly trade at
//     the houses" and /sell goes house-first. Below 2/3, venue-neutral: receipts still show house
//     sales, but no house-first recommendation.
// Facts only (product rule 3): the client composes every intake question and chip label.
// Aligned to the RANGE LADDER (Part 3, bug 2): the ladder gives a band at 8+ sales, so THIN MODE must
// only fire BELOW the band floor (< 8 online). At 15 it stole the 8-14 band - a 14-sale 996 Turbo S
// Cabriolet pool refused as "thin" instead of showing the 8-15 middle-half band. Now <8 online is thin
// (sales listed, house steer); 8-15 lands on buildResult's band; 16+ on the cluster.
const HT_ONLINE_MIN = 8;
const HT_WINDOW_DAYS = 1095; // 36 months (the /sell house read and the price band keep this window)
// OB_THIN_WINDOW_DAYS (Sam, Oct 14 2026, golden car 16): the One Box thin gate reads the written ladder's
// window, "the last twelve months when that already holds eight sales; otherwise the engine looks back up
// to five years and labels the window" (docs/golden-rules.md). The gate used to stop at 36 months, so a
// 2005 Saab 9-2X with 4 online sales in 36 months and 20 in five years was called thin and never reached
// the exact rung the written ladder gives it. Same window the year walk already fetches (fetchPool 1825).
const OB_THIN_WINDOW_DAYS = 1825; // 60 months
const HT_STEER_SHARE = 2 / 3;
const htVenue = r => platformName(sourceSlugOf(r)) || String(r.source || "");
// Item 4: chassis for house/class receipts. Full where the listing states it in the title
// ("Chassis no. 2147", "s/n 076"); else the last digits of the normalized VIN/chassis field.
function chassisFromTitle(title) {
  const m = String(title || "").match(/\b(?:chassis|s\/n|serial)\s*(?:no\.?|number|#)?\s*[:.]?\s*([A-Z0-9][A-Z0-9.\-\/]{2,22})/i);
  return m && m[1] ? m[1].replace(/[.\-\/]+$/, "").trim() : null;
}
function chassisTail(vinNorm) {
  const v = String(vinNorm || "").replace(/[^A-Z0-9]/gi, "");
  return v.length >= 4 ? v.slice(-6) : null;
}
function htReceipt(r) {
  const isHouse = isHouseSource(r.source);
  const title = String(r.raw_title || r.rtitle || "");
  const cur = String(r.currency || "USD").toUpperCase();
  // Native-currency figures (item 5): only when a house sale settled in a non-USD currency, so
  // a EUR/GBP result leads with its own figure and shows the USD computed beside it.
  const np = (isHouse && cur !== "USD") ? nativePrices(r) : null;
  return {
    // id (Round 6 Job 1, tracking fix): see shapeCards' own id note - same reason, same fix, the
    // thin/class-era receipt shape.
    id: r.id != null ? r.id : null,
    venue: htVenue(r),
    slug: sourceSlugOf(r),
    isHouse,
    date: String(r.auction_end_date || "").slice(0, 10),
    soldLabel: soldLabel(r.auction_end_date),
    hammer: r._hammer,
    allIn: isHouse ? r._allin : null,
    currency: cur,
    nativeCur: np ? np.currency : null,
    nativeHammer: np ? np.hammer : null,
    nativeAllIn: np ? np.total : null,
    year: r.year || null,
    mileage: miOf(r) || null,
    transmission: r.transmission ? String(r.transmission) : null,
    title: humanTitle(title),
    // Tier-aware fields (item 4): chassis + colour surface on house/class receipts, mileage secondary.
    chassis: isHouse ? chassisFromTitle(title) : null,
    chassisTail: isHouse ? chassisTail(r.vin_norm) : null,
    color: (isHouse && r.color && String(r.color).trim() && !/^null$/i.test(String(r.color))) ? String(r.color).trim() : null,
    markers: ((Array.isArray(r.desc_facts && r.desc_facts.markers) ? r.desc_facts.markers : extractMarkers(r))).map(k => ({ key: k, label: markerLabel(k) })),
    vinNorm: r.vin_norm ? String(r.vin_norm) : null,
    image: r.image || null,   // thumbnail for the compact receipt row (hard rule: every row keeps one)
    url: r.srcurl || r.srcurl2 || r.url || null,
    // House-comparison (Sep 2026): the auction location the record carries. RM populates city with
    // the sale city (Monterey); used by eventFromRecord to state the room as a data fact. Others null.
    city: isHouse && r.city && String(r.city).trim() && !/^null$/i.test(String(r.city)) ? String(r.city).trim() : null
  };
}
const htMedOf = arr => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2); };
const htFork = (a, b) => (a && b) ? Math.max(a, b) / Math.min(a, b) : 1;
// The ONE split whose answer most forks this car's price. Candidates: config markers (vintage),
// a mileage band (modern), or transmission. Each qualifies only with >=2 receipts each side AND a
// >=1.4x median-price fork. Returns FACTS; the client composes the question + chip labels. Null =
// no split, so the render skips the intake line entirely (never an empty intake).
function pickThinIntake(receipts) {
  const N = receipts.length, cands = [];
  const counts = {};
  for (const rc of receipts) for (const m of rc.markers) counts[m.key] = (counts[m.key] || 0) + 1;
  for (const [k, c] of Object.entries(counts)) {
    if (c < 2 || N - c < 2) continue;
    const wM = htMedOf(receipts.filter(r => r.markers.some(m => m.key === k)).map(r => r.hammer));
    const oM = htMedOf(receipts.filter(r => !r.markers.some(m => m.key === k)).map(r => r.hammer));
    const sep = htFork(wM, oM);
    if (sep >= 1.4) cands.push({ kind: "marker", markerKey: k, markerLabel: markerLabel(k), withN: c, withoutN: N - c, sep });
  }
  const withMi = receipts.filter(r => Number(r.mileage) > 0);
  if (withMi.length >= 4) {
    const thr = htMedOf(withMi.map(r => Number(r.mileage)));
    const lo = withMi.filter(r => Number(r.mileage) <= thr), hi = withMi.filter(r => Number(r.mileage) > thr);
    if (lo.length >= 2 && hi.length >= 2) {
      const sep = htFork(htMedOf(lo.map(r => r.hammer)), htMedOf(hi.map(r => r.hammer)));
      if (sep >= 1.4) cands.push({ kind: "mileage", threshold: thr, thresholdK: Math.max(1, Math.round(thr / 1000)), lowN: lo.length, highN: hi.length, sep });
    }
  }
  const man = receipts.filter(r => R4_MANUAL(String(r.transmission || ""))), aut = receipts.filter(r => R4_AUTO(String(r.transmission || "")));
  if (man.length >= 2 && aut.length >= 2) {
    const sep = htFork(htMedOf(man.map(r => r.hammer)), htMedOf(aut.map(r => r.hammer)));
    if (sep >= 1.4) cands.push({ kind: "transmission", manN: man.length, autN: aut.length, sep });
  }
  cands.sort((a, z) => z.sep - a.sep);
  return cands[0] || null;
}
async function assessThin(famSpec, trimName, trimRe, iso, env, diag, opts = {}) {
  // Fetch the model family WITHOUT a DB title pre-filter: a titleContains of the resolved trim
  // ("GTB Daytona") would ilike *GTB Daytona* at the database and return zero, because the archive
  // writes "365 GTB/4 Daytona" (the /4 breaks the phrase). Scope the trim in-memory below instead.
  const raw = await fetchQualifying({ ...famSpec, houseTier: true }, iso(OB_THIN_WINDOW_DAYS), env, diag);
  const ttl = r => String(r.raw_title || r.rtitle || "");
  // Trim scope: the precise resolved trim first. When that is too thin (< 2), fall back to the
  // LEADING trim token, the body/designation code that defines the sub-model (275 "GTB", 250
  // "GTO"). This is what fixes the Daytona: the resolver yields trim "GTB Daytona" but the archive
  // writes "365 GTB/4 Daytona", so the adjacent-phrase match finds nothing while "GTB" isolates
  // the Daytona out of the blended 365 family (GTC / GT 2+2 / GTC/4 / California) cleanly.
  let scoped = trimRe ? raw.filter(r => trimRe.test(ttl(r))) : raw;
  if (trimName && trimRe && scoped.length < 2) {
    const firstTok = String(trimName).trim().split(/\s+/)[0];
    const ftRe = firstTok ? trimTitleRe(firstTok) : null;
    if (ftRe) { const alt = raw.filter(r => ftRe.test(ttl(r))); if (alt.length >= scoped.length) scoped = alt; }
  }
  // Race/road trim-family fence (item 2): a named race trim (GT2 R) pools ONLY its family (GT2 R +
  // GT2 Evo); a road badge (GT2) drops its race siblings. Comparables must match the trim family.
  scoped = applyTrimFamilyFence(famSpec.make, famSpec.model, trimName, raw, scoped, ttl);
  let pool = scoped
    .map(r => ({ ...r, _hammer: Math.round(hammerUsd(r)), _allin: Math.round(outcomeUsd(r)) }))
    .filter(r => Number.isFinite(r._hammer) && r._hammer > 0);
  // SET-ASIDE ROWS WITH REASONS (item 10, e47): every row the thin path holds out, kept with its reason words so the
  // page can show it as a labelled tile; the count plus the pool is the qualifying total.
  const thinSetAsideRows = [];
  const holdOut = (keep, reasonOf) => { const kept = pool.filter(keep); for (const r of pool) if (!kept.includes(r)) thinSetAsideRows.push({ row: r, reason: reasonOf(r) }); pool = kept; };
  // MODEL-SPECIFIC HALOS (bug 6): drop alloy-body / race 300SLs from the thin pool too, so a house-led
  // Gullwing read is the steel-car market, not blown out by a $5M alloy car. Make+model scoped.
  { const mhRe = modelHaloReFor(famSpec.make, famSpec.model); if (mhRe) holdOut(r => !(mhRe.test(ttl(r))), () => "odd sale"); }
  // PROVENANCE (bug 3) + ENGINE SWAP: an ex-celebrity / works / press / show car OR an engine-swapped
  // car is a halo in thin mode too, so it never sits in the receipts that stand in for the range.
  holdOut(r => !isProvenance(r) && !isEngineSwap(r, famSpec.make, famSpec.model), r => isEngineSwap(r, famSpec.make, famSpec.model) ? "modified" : "odd sale");
  // Base/model rung (opts.setAsideHalo): dropping the trim to read the whole model must NOT pull
  // the halos/special editions up into the base pool (direction rule). Set them aside via the
  // SHARED rule so "all Murcielagos" excludes the SV / 40th Anniversary / Reventon.
  let thinSetAsideN = 0;
  if (opts.setAsideHalo) {
    // BADGE-AWARE halo set-aside (rule 16 intrinsic-AMG trap, Sep 2026): a performance-BADGE or
    // intrinsic-AMG pool ("S65", "SLS AMG") IS the AMG, so the generic make-halo would set aside
    // the badge's OWN cars (every S65 title carries "AMG") and empty the pool - which surfaced as a
    // false class_era for the S65. For a badge/intrinsic-AMG query set aside only variants genuinely
    // ABOVE the badge (Black Series), mirroring the trim ladder's haloRe; a BASE query keeps the
    // full make-halo. Race cars / restomods / tuners are always set aside either way.
    const intrinsicAmg = intrinsicAmgFor(famSpec.make, famSpec.model, famSpec.year);
    const badgeAware = !!(famSpec.badge || intrinsicAmg);
    const badgeHaloRe = /mercedes|benz/i.test(famSpec.make) ? /\bblack\s?series\b/i : haloMatcherFor(famSpec.make);
    const before = pool.length;
    const thinReason = r => {
      const t = String(r.raw_title || r.rtitle || "");
      if (badgeAware) {
        if (recordExcludeReason(r, famSpec.make, { wantHalo: true, self: `${famSpec.model || ""} ${famSpec.trim || ""}` })) return "odd sale"; // race/restomod/tuner always
        if (badgeHaloRe && badgeHaloRe.test(t)) return "odd sale";                        // only variants ABOVE the badge
      } else {
        if (recordExcludeReason(r, famSpec.make, { wantHalo: false, self: `${famSpec.model || ""} ${famSpec.trim || ""}` })) return "odd sale"; // full make-halo for a base query
      }
      // A car TITLED "Modified" is not a clean comp (item 4) - set it aside. A "6-Speed Conversion"
      // is NOT set aside: it stays in the pool, labelled a conversion (never a factory manual).
      if (/\bmodified\b/i.test(t) && !/conversion|converted/i.test(t)) return "modified";
      return null;
    };
    holdOut(r => thinReason(r) === null, thinReason);
    thinSetAsideN = before - pool.length;
  }
  // VARIANT MARKET on the thin path (e40, Sam's Job 4): the same rule as the volume path. Fewer than eight
  // variant sales are set aside (never in the receipts that stand in for the range) and counted; the thin
  // label names the base cars and the set-aside. Eight or more on both sides would be a question, which the
  // thin path cannot ask (house pools have no range to split), so they stay and the label names the mix.
  let thinVariantAside = null; const thinVariantAsides = [], thinVariantOptionsLine = [];
  for (const vm of (famSpec.variantMarkets || []).filter(v => !(famSpec.askedVariantKeys || []).includes(v.key))) {
    const vrows = pool.filter(r => vm.re.test(ttl(r))), srows = pool.filter(r => !vm.re.test(ttl(r)));
    const stdKey = vm.nonKey || "standard";
    // e51 (Sam's decision): an option line only when both sides have sales under the variant rule (eight or more
    // each, medians 25 percent apart); never for the generic restoration entry; a zero-count side is never offered.
    const medT = a => { const v = a.map(r => Number(r._usd != null ? r._usd : r._hammer)).filter(x => Number.isFinite(x) && x > 0); return v.length ? percentile(v, 0.5) : null; };
    const mvT = medT(vrows), msT = medT(srows);
    const apartT = mvT != null && msT != null && Math.abs(mvT - msT) / Math.min(mvT, msT) >= 0.25;
    if (!vm.generic && vrows.length >= RANGE_THRESHOLD && srows.length >= RANGE_THRESHOLD && apartT) thinVariantOptionsLine.push({ key: vm.key, options: [{ value: stdKey, label: cap(vm.base), n: srows.length, refine: { variant: stdKey } }, { value: vm.key, label: cap(vm.label), n: vrows.length, refine: { variant: vm.key } }] });
    const asideVariant = vm.smallerSide ? (vrows.length <= srows.length) : true;
    const asideRows = asideVariant ? vrows : srows, asideLabel = asideVariant ? vm.label : vm.base, keptLabel = asideVariant ? vm.base : vm.label;
    if (asideRows.length && asideRows.length < RANGE_THRESHOLD && (!vm.smallerSide || asideRows.length < pool.length)) {
      holdOut(r => !asideRows.includes(r), () => asideLabel); thinSetAsideN += asideRows.length;
      thinVariantAsides.push({ key: vm.key, label: asideLabel, base: keptLabel, n: asideRows.length, generic: !!vm.generic });
    } else if (!vm.generic) {
      thinVariantAsides.push({ key: vm.key, label: vm.label, base: vm.base, n: 0, mixed: vrows.length >= RANGE_THRESHOLD ? vrows.length : 0, generic: false });
    }
  }
  thinVariantAside = thinVariantAsides.find(x => !x.generic) || null;
  // Drop project/incomplete/shell/non-original cars (item 1) via title + description, so an unfinished
  // shell is never a comp, a range member, a house ranking entry or an ask comparison for a running car.
  { const beforeProj = pool.slice(); pool = await filterProjectRows(pool, env); for (const r of beforeProj) if (!pool.includes(r)) thinSetAsideRows.push({ row: r, reason: "project" }); }
  const house = pool.filter(r => isHouseSource(r.source));
  const online = pool.filter(r => !isHouseSource(r.source));
  // THIN trigger: the VOLUME-capable online count (photo-gated, like volume mode) is too small to
  // stand a cluster. House presence is NOT required (that is the steer, below).
  const onlineVolumeN = online.filter(r => r.image).length;
  const isThin = onlineVolumeN < HT_ONLINE_MIN && pool.length >= 1;
  // HOUSE STEER: house share of the receipt pool >= two-thirds. This, and only this, licenses the
  // "these mostly trade at the houses" read and the /sell house-first recommendation.
  const denom = house.length + online.length;
  const houseSteer = denom > 0 && (house.length / denom) >= HT_STEER_SHARE;
  const meta = { isThin, houseSteer, onlineN: onlineVolumeN, onlineReceiptsN: online.length, houseN: house.length, totalN: pool.length, windowMonths: Math.round(OB_THIN_WINDOW_DAYS / 30.4), variantAside: thinVariantAside, variantAsides: thinVariantAsides, variantOptionsLine: thinVariantOptionsLine.length ? thinVariantOptionsLine : null, setAsideRows: shapeCards(withUsd(thinSetAsideRows.map(x => x.row))).map((c, i) => ({ ...c, reason: thinSetAsideRows[i].reason, setAside: true })), setAsideN: thinSetAsideN };
  if (!isThin) return meta;

  const receipts = pool.map(htReceipt).sort((a, z) => z.hammer - a.hammer);

  // Paired sales: same chassis (vin_norm) sold both online AND at a house. The stated % stays
  // DORMANT until a model clears 3 such pairs; below that we surface the two receipts only.
  const byVin = new Map();
  for (const rc of receipts) {
    if (!rc.vinNorm) continue;
    if (!byVin.has(rc.vinNorm)) byVin.set(rc.vinNorm, []);
    byVin.get(rc.vinNorm).push(rc);
  }
  const pairs = [...byVin.values()]
    .filter(g => g.some(x => x.isHouse) && g.some(x => !x.isHouse))
    .map(g => [...g].sort((a, z) => String(a.date).localeCompare(String(z.date))));

  const intake = pickThinIntake(receipts);
  const medianHammer = htMedOf(receipts.map(r => r.hammer));
  // The RECORD RANGE (rule 23, "the RANGE is the record"): the real min-to-max of the thin pool's
  // hammer prices. This is EXACTLY what the thin hero already renders ("The recorded sales ran from
  // $X to $Y"); exposing it as `span` lets a house-dominated but well-populated car (a 300SL
  // Roadster, 27 sales) carry an honest range, not only individual receipts. 2+ sales with a real
  // spread only (a single sale is a receipt, not a range).
  const hammers = receipts.map(r => r.hammer).filter(h => Number.isFinite(h) && h > 0).sort((a, b) => a - b);
  const span = (hammers.length >= 2 && hammers[hammers.length - 1] > hammers[0]) ? [roundFloor(hammers[0]), roundCeil(hammers[hammers.length - 1])] : null;
  // `cards` from the SAME `pool` that built `receipts`/`span` above (one engine rule item, Oct 2026):
  // thin-tier results used to carry no `cards` at all, so a consumer reading d.cards for a "last three"
  // style summary got an empty/undefined array on a thin car and either showed nothing or fell through
  // to a stale value from a different query. Now every tier's `cards` is the exact pool behind its own
  // printed span/count, never a different car's.
  // rawPool (Oct 2026, one-engine-ladder item): the SAME priced rows `cards` is shaped from, exposed
  // raw (source/mileage/auction_end_date/_usd intact) for a non-UI consumer (Sell's platformPick.js)
  // that needs real row fields `cards`' display shape drops. Purely additive - no existing field or
  // behavior changes; nothing before this round read it.
  const pricedPool = withUsd(pool);
  return { ...meta, receipts, pairs, pairsCount: pairs.length, pairPctEligible: pairs.length >= 3, intake, medianHammer, span, cards: shapeCards(pricedPool), rawPool: pricedPool };
}

// RESERVE INSIGHT (item 2b, Oct 2026): reserve vs no-reserve within the SAME model + trim + model-year
// window (generation if the trim is thin), the fair comparison Sam's newsletter uses - NOT "997 across
// Carrera to GT3". Counts UNSOLD reserve-not-met cars at their high bid (auction_attempts) on the
// generation fallback, where the attempts table (which carries no title) can be matched model+year.
// Archive-only, zero OldCarsData. Returns { ok, deltaPct, nReserve, nNoReserve, scopeLabel, unsold, window }.
const RESERVE_INSIGHT_MIN = 8;   // per side; below this the tile is hidden (too thin to read honestly)
const _riMed = a => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
// Ordinal vs chassis-code generation wording (Oct 2026, Lane B Job 3): generation.code is either a
// real chassis code (E30, 991.2, SN95 - uppercase is correct) or an ORDINAL WORD (first..tenth, used
// where no chassis code exists, e.g. Mustang generations) - unconditionally uppercasing produced
// "FIRST Mustangs" / "FIRST-generation Mustang". Mirrors js/result-v2.js's V2_ORDINAL/v2GenWord/
// v2GenPhrase (a different runtime - classic frontend script, not an ES module - so duplicated here
// rather than shared; same rule, keep the two in step by hand).
const RESERVE_ORDINAL_RE = /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)$/i;
const reserveGenWord = code => { const g = String(code || ""); return RESERVE_ORDINAL_RE.test(g) ? g.toLowerCase() : g.toUpperCase(); };
export async function reserveInsightForVehicle(vehicle, generation, env) {
  try {
    if (!vehicle || !vehicle.make || !vehicle.model || !env) return { ok: false };
    const make = vehicle.make;
    const trim = vehicle.trim && String(vehicle.trim).trim() ? String(vehicle.trim).trim() : null;
    const modelTok = String(vehicle.model || "").replace(/^[A-Za-z]\d{2,3}\s+/, "").trim() || String(vehicle.model || "");
    const yr = Number(vehicle.year) || null;
    const since = new Date(obNow() - 365 * 864e5).toISOString().slice(0, 10);   // 12 months (item 2c)
    const trimRe = trim ? trimTitleRe(trim) : null;
    // Chassis-code union: the archive files modern 911s under "997"/"991", not the "911" nameplate,
    // so a bare model-column scope reads thin. When the generation names a chassis code, match either
    // the nameplate token OR the code (SAME year/date scope) - the archive's other spelling of the car.
    const codeTok = generationModelToken(generation);
    const modelFilter = (codeTok && codeTok.toLowerCase() !== modelTok.toLowerCase())
      ? `&or=(model.ilike.${encodeURIComponent("*" + modelTok + "*")},model.ilike.${encodeURIComponent("*" + codeTok + "*")})`
      : `&model=ilike.${encodeURIComponent("*" + modelTok + "*")}`;
    // Sold rows carrying a reserve flag (online platforms). Scope make+model+year; trim filtered in code.
    const soldRows = async (yMin, yMax) => {
      let q = `sales_archive?select=sale_price,has_reserve,listing_title,source:platform,currency:raw_record->>currency,cc:raw_record->>country_code,state:raw_record->>state,city:raw_record->>city&make=ilike.${encodeURIComponent("*" + make + "*")}${modelFilter}&sale_price=not.is.null&has_reserve=not.is.null&sale_date=gte.${since}`;
      if (yMin != null) q += `&year=gte.${yMin}`; if (yMax != null) q += `&year=lte.${yMax}`;
      // IN THE MARKET (Oct 15 2026): the reserve tile counts the same United States and Canada sales as the pool.
      return ((await supabaseSelectAll(env, q)) || []).filter(r => inMarket({ ...r, raw_title: r.listing_title }));
    };
    const splitSold = (rows, applyTrim) => {
      const res = [], no = [];
      for (const r of rows) { const v = Number(r.sale_price); if (!(v > 0)) continue; if (applyTrim && trimRe && !trimRe.test(String(r.listing_title || ""))) continue; (r.has_reserve === true || String(r.has_reserve) === "true" ? res : no).push(v); }
      return { res, no };
    };
    const build = (res, no, label, unsold) => {
      if (res.length < RESERVE_INSIGHT_MIN || no.length < RESERVE_INSIGHT_MIN) return null;
      const mRes = _riMed(res), mNo = _riMed(no);
      const deltaPct = mNo > 0 ? Math.round(((mRes - mNo) / mNo) * 100) : 0;
      return { ok: true, deltaPct, nReserve: res.length, nNoReserve: no.length, n: res.length + no.length, scopeLabel: label, unsold: unsold || 0, windowMonths: 12 };
    };
    // 1) Trim + model-year (+/-2): the fair, trim-clean comparison. Sold-only (attempts carry no title).
    if (trim && yr) {
      const rows = await soldRows(yr - 2, yr + 2);
      const { res, no } = splitSold(rows, true);
      const hit = build(res, no, nameplate(vehicle.model, trim) || [make, vehicle.model, trim].filter(Boolean).join(" "), 0);
      if (hit) return hit;
    }
    // 2) Generation fallback (thin trim): the generation's year range, ALL trims, PLUS unsold
    // reserve-not-met at high bid (auction_attempts, matched model+year - no title, so generation only).
    const gMin = generation && generation.yearStart ? generation.yearStart : (yr ? yr - 2 : null);
    const gMax = generation && generation.yearEnd ? generation.yearEnd : (yr ? yr + 2 : null);
    const grows = await soldRows(gMin, gMax);
    const { res, no } = splitSold(grows, false);
    let qa = `auction_attempts?select=high_bid&make=ilike.${encodeURIComponent("*" + make + "*")}${modelFilter}&auction_status=eq.reserve_not_met&high_bid=not.is.null&attempt_date=gte.${since}`;
    if (gMin != null) qa += `&year=gte.${gMin}`; if (gMax != null) qa += `&year=lte.${gMax}`;
    const unsold = (await supabaseSelectAll(env, qa)) || [];
    for (const a of unsold) { const v = Number(a.high_bid); if (v > 0) res.push(v); }   // unsold reserve at high bid
    const genLabel = (generation && generation.code
      ? (RESERVE_ORDINAL_RE.test(String(generation.code)) ? `${reserveGenWord(generation.code)} generation ${vehicle.model}` : `${reserveGenWord(generation.code)}-generation ${vehicle.model}`)
      : [make, vehicle.model].filter(Boolean).join(" "));
    return build(res, no, genLabel, unsold.length) || { ok: false, nReserve: res.length, nNoReserve: no.length };
  } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
}

// Model+generation scope filters shared by the reserve-day + venue-count archive reads. Uses the
// chassis-code union (911 OR 997/991) so code-filed cars are not missed, and the generation year range.
function _archiveScopeFilters(vehicle, generation) {
  const make = vehicle.make;
  const modelTok = String(vehicle.model || "").replace(/^[A-Za-z]\d{2,3}\s+/, "").trim() || String(vehicle.model || "");
  const codeTok = generationModelToken(generation);
  const modelFilter = (codeTok && codeTok.toLowerCase() !== modelTok.toLowerCase())
    ? `&or=(model.ilike.${encodeURIComponent("*" + modelTok + "*")},model.ilike.${encodeURIComponent("*" + codeTok + "*")})`
    : `&model=ilike.${encodeURIComponent("*" + modelTok + "*")}`;
  const gMin = generation && generation.yearStart ? generation.yearStart : (vehicle.year ? vehicle.year - 2 : null);
  const gMax = generation && generation.yearEnd ? generation.yearEnd : (vehicle.year ? vehicle.year + 2 : null);
  return { mk: encodeURIComponent("*" + make + "*"), modelFilter, gMin, gMax };
}

// Reserve-car DAY insight (Sep 2026; buckets Oct 2026): the real weekday effect for reserve auctions
// is SELL-THROUGH, not price (matched same make/model/year, weekend vs weekday prices are within ~1%).
// Picking the single best of seven days over 20-40 auctions mostly finds chance, so it is split into
// TWO buckets: weekend (Sat/Sun) vs midweek (Mon-Fri). Needs BOTH sides: SOLD reserve cars
// (sales_archive, has_reserve) + reserve-not-met (auction_attempts), scoped to BRING A TRAILER (the
// platform that reports both). Shown only when EACH bucket has >=30 auctions AND the two sell-through
// rates differ by >=5 points; otherwise hidden. Counts only (no price). Generation-scoped.
const RESERVE_DAY_BUCKET_MIN = 30;   // auctions per bucket (weekend / midweek)
const RESERVE_DAY_MIN_GAP = 5;       // sell-through points between the buckets
const _isWeekendIso = iso => { const d = new Date(String(iso || "")); if (isNaN(d.getTime())) return null; const g = d.getUTCDay(); return g === 0 || g === 6; };
export async function reserveDayInsightForVehicle(vehicle, generation, env) {
  try {
    if (!vehicle || !vehicle.make || !vehicle.model || !env) return { ok: false };
    const { mk, modelFilter, gMin, gMax } = _archiveScopeFilters(vehicle, generation);
    const yq = (gMin != null ? `&year=gte.${gMin}` : "") + (gMax != null ? `&year=lte.${gMax}` : "");
    const since = new Date(obNow() - 730 * 864e5).toISOString().slice(0, 10);   // 24 months
    const sold = (await supabaseSelectAll(env, `sales_archive?select=sale_date&source_slug=eq.bringatrailer&has_reserve=eq.true&sale_price=not.is.null&sale_date=gte.${since}&make=ilike.${mk}${modelFilter}${yq}`)) || [];
    const unsold = (await supabaseSelectAll(env, `auction_attempts?select=attempt_date&source_slug=eq.bringatrailer&auction_status=eq.reserve_not_met&attempt_date=gte.${since}&make=ilike.${mk}${modelFilter}${yq}`)) || [];
    // sold[w]/tot[w] per bucket: 0 = weekend, 1 = midweek.
    const sold2 = [0, 0], tot2 = [0, 0];
    for (const r of sold) { const w = _isWeekendIso(r.sale_date); if (w == null) continue; const b = w ? 0 : 1; sold2[b]++; tot2[b]++; }
    for (const r of unsold) { const w = _isWeekendIso(r.attempt_date); if (w == null) continue; const b = w ? 0 : 1; tot2[b]++; }
    if (tot2[0] < RESERVE_DAY_BUCKET_MIN || tot2[1] < RESERVE_DAY_BUCKET_MIN) return { ok: false, reason: "bucket<30", weekendN: tot2[0], weekdayN: tot2[1] };
    const weekendPct = Math.round(sold2[0] / tot2[0] * 100);
    const weekdayPct = Math.round(sold2[1] / tot2[1] * 100);
    if (Math.abs(weekendPct - weekdayPct) < RESERVE_DAY_MIN_GAP) return { ok: false, reason: "gap<5", weekendPct, weekdayPct, weekendN: tot2[0], weekdayN: tot2[1] };
    const scopeLabel = (generation && generation.code ? `${reserveGenWord(generation.code)} ${vehicle.model}` : [vehicle.make, vehicle.model].filter(Boolean).join(" "));
    return { ok: true, weekendPct, weekdayPct, weekendN: tot2[0], weekdayN: tot2[1], sample: tot2[0] + tot2[1], winner: weekendPct >= weekdayPct ? "weekend" : "weekday", scopeLabel, windowMonths: 24 };
  } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
}

// Accurate venue sales COUNT + recency for a scope (item 1 fix): the matched-premium thin fallback used
// to count from the bounded sell-flow evidence pool (limit-1000, ladder/evidence-filtered, exact-year),
// which drastically undercounted ("5 2004 M3s", "9 997s"). This counts EVERY matching SOLD row on the
// venue in sales_archive over the window, scoped to match the displayed label: exact year for a
// year-scoped read, the generation year range for a generation read. Archive-only, zero OldCarsData.
export async function venueScopedSalesForVehicle(vehicle, generation, platform, yearScope, env) {
  try {
    if (!vehicle || !vehicle.make || !vehicle.model || !platform || !env) return { count: 0, recencyDate: null };
    const { mk, gMin, gMax } = _archiveScopeFilters(vehicle, generation);
    // Count by MODEL column OR listing TITLE: many rows carry the nameplate in the title but a generic
    // model column, so a model-only scope undercounts the venue's true sales (31 vs 53 real 2004 M3s).
    const modelTok = String(vehicle.model || "").replace(/^[A-Za-z]\d{2,3}\s+/, "").trim() || String(vehicle.model || "");
    const codeTok = generationModelToken(generation);
    const toks = [modelTok]; if (codeTok && codeTok.toLowerCase() !== modelTok.toLowerCase()) toks.push(codeTok);
    const orParts = [];
    for (const t of toks) { const enc = encodeURIComponent("*" + t + "*"); orParts.push(`model.ilike.${enc}`, `listing_title.ilike.${enc}`); }
    const modelFilter = `&or=(${orParts.join(",")})`;
    // Item 2: when the landed rung kept the trim, scope the count to the trim via the listing title so
    // the venue count describes the SAME car as the range (29 Carrera S, not 144 year-only 911s). A trim
    // that matches nothing leaves count 0, and the caller keeps the already trim-scoped matched count.
    const trimTok = env && env.trim ? String(env.trim).trim() : "";
    const trimFilter = trimTok ? `&listing_title=ilike.${encodeURIComponent("*" + trimTok + "*")}` : "";
    let yq = "";
    if (yearScope === "exact_year" && vehicle.year) yq = `&year=eq.${Number(vehicle.year)}`;
    else if (yearScope === "generation") yq = (gMin != null ? `&year=gte.${gMin}` : "") + (gMax != null ? `&year=lte.${gMax}` : "");
    else if (yearScope === "near_years" && vehicle.year) yq = `&year=gte.${Number(vehicle.year) - 2}&year=lte.${Number(vehicle.year) + 2}`;
    // year_range / any_year / make -> no year filter (matches the "any year" label)
    const since = new Date(obNow() - 730 * 864e5).toISOString().slice(0, 10);   // 24 months
    const base = `sales_archive?source_slug=eq.${encodeURIComponent(platform)}&sale_price=not.is.null&sale_date=gte.${since}&make=ilike.${mk}${modelFilter}${trimFilter}${yq}`;
    const res = await fetch(`${env.supabaseUrl}/rest/v1/${base}&select=id&limit=1`, {
      headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0", "Range-Unit": "items" }
    });
    const cr = res.headers.get("content-range") || ""; const m = cr.match(/\/(\d+)$/);
    const count = m ? Number(m[1]) : 0;
    let recencyDate = null;
    if (count > 0) { const newest = await supabaseSelect(env, `${base}&select=sale_date&order=sale_date.desc&limit=1`); recencyDate = (newest && newest[0] && newest[0].sale_date) ? String(newest[0].sale_date).slice(0, 10) : null; }
    return { count, recencyDate };
  } catch (e) { return { count: 0, recencyDate: null }; }
}

// Reusable thin/steer assessment for a resolved vehicle, so /sell can render the same THIN MODE
// and HOUSE STEER as One Box. Reads the ARCHIVE only (sales_archive) - ZERO OldCarsData spend,
// so it never adds a metered fetch to the /sell path. Returns the assessThin object (isThin,
// houseSteer, receipts, intake, ...) or {isThin:false} when it cannot scope.
export async function assessThinForVehicle(vehicle, generation, env) {
  if (!vehicle || !vehicle.make) return { isThin: false };
  const searchText = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  const spec = buildSpec(vehicle, generation, searchText);
  if (!spec || !spec.make) return { isThin: false };
  const famSpec = { ...spec, perfInclude: null, perfExclude: null, excludeVariants: [] };
  const trimName = spec.trim && String(spec.trim).trim() ? String(spec.trim).trim() : null;
  const trimRe = trimName ? trimTitleRe(trimName) : null;
  const now = obNow();
  const iso = days => new Date(now - days * 864e5).toISOString();
  // Retry once on a transient fetch error (a broad marque like Ferrari can time out the archive read
  // under load). A thrown read must surface as null so the caller keeps the normal decision and never
  // widens to the wider-make class band; only a genuine empty pool reads as zero sales.
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await assessThin(famSpec, trimName, trimRe, iso, env, {}); }
    catch (e) { lastErr = e; }
  }
  return null;   // signal ERROR (not "zero sales") so the decision never falls to the wider make
}

// A resolved model's own HOUSE sales (last 36 months) as buildHouseComparison-ready receipts, with
// halos/specials/race/restomod/modified set aside, returned REGARDLESS of whether the car is thin.
// Powers the auction-house door for a DENSE car that genuinely sells at the houses (the 550 Maranello:
// 30 in 36 months) so it shows the car's OWN house record, not the "these trade mostly online" bridge.
// Also reports onlineN so the "no online sales, here are the houses" state can be stated honestly.
export async function houseReceiptsForVehicle(vehicle, generation, env) {
  try {
    if (!vehicle || !vehicle.make || !env) return null;
    const searchText = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
    const spec = buildSpec(vehicle, generation, searchText);
    if (!spec || !spec.make) return null;
    const famSpec = { ...spec, perfInclude: null, perfExclude: null, excludeVariants: [] };
    const trimName = spec.trim && String(spec.trim).trim() ? String(spec.trim).trim() : null;
    const trimRe = trimName ? trimTitleRe(trimName) : null;
    const isoD = days => new Date(obNow() - days * 864e5).toISOString();
    const raw = await fetchQualifying({ ...famSpec, houseTier: true }, isoD(HT_WINDOW_DAYS), env, {});
    const ttl = r => String(r.raw_title || r.rtitle || "");
    let scoped = trimRe ? raw.filter(r => trimRe.test(ttl(r))) : raw;
    if (trimName && trimRe && scoped.length < 2) {
      const firstTok = String(trimName).trim().split(/\s+/)[0];
      const ftRe = firstTok ? trimTitleRe(firstTok) : null;
      if (ftRe) { const alt = raw.filter(r => ftRe.test(ttl(r))); if (alt.length >= scoped.length) scoped = alt; }
    }
    // Race/road trim-family fence (item 2): the house pool for a named race trim (GT2 R) carries ONLY
    // that family (GT2 R + GT2 Evo); a road badge (GT2) drops its race siblings.
    scoped = applyTrimFamilyFence(famSpec.make, famSpec.model, trimName, raw, scoped, ttl);
    // Set aside halos / specials / race / restomod / modified via the SHARED rule (same as assessThin's
    // base rung), so the house record reads the base car (no Enzo in a 550 house list).
    const intrinsicAmg = intrinsicAmgFor(famSpec.make, famSpec.model, famSpec.year);
    const badgeAware = !!(famSpec.badge || intrinsicAmg);
    const badgeHaloRe = /mercedes|benz/i.test(famSpec.make) ? /\bblack\s?series\b/i : haloMatcherFor(famSpec.make);
    const base = scoped.filter(r => {
      const t = ttl(r);
      if (badgeAware) { if (recordExcludeReason(r, famSpec.make, { wantHalo: true, self: `${famSpec.model || ""} ${famSpec.trim || ""}` })) return false; if (badgeHaloRe && badgeHaloRe.test(t)) return false; }
      else if (recordExcludeReason(r, famSpec.make, { wantHalo: false, self: `${famSpec.model || ""} ${famSpec.trim || ""}` })) return false;
      if (/\bmodified\b/i.test(t) && !/conversion|converted/i.test(t)) return false;
      return true;
    });
    // Drop project/incomplete/shell/non-original cars (item 1) via title + description before ranking,
    // so an unfinished shell never leads the house record or enters the ask comparison.
    const complete = await filterProjectRows(base, env);
    const priced = complete.map(r => ({ ...r, _hammer: Math.round(hammerUsd(r)), _allin: Math.round(outcomeUsd(r)) }))
      .filter(r => Number.isFinite(r._hammer) && r._hammer > 0);
    const houseReceipts = priced.map(htReceipt).filter(r => r.isHouse);
    const onlineRecs = priced.filter(r => !isHouseSource(r.source));
    // onlineN is photo-gated (card-display eligible, mirrors assessThinForVehicle's onlineVolumeN);
    // onlineReceiptsN is the TRUE online count. houseN + onlineReceiptsN === totalN always; houseN +
    // onlineN can undercount by however many online sales have no stored image (e.g. a Bring a
    // Trailer record missing featured_image_url) - callers building a "no online sales" statement or
    // a by-venue sum MUST use onlineReceiptsN, never onlineN, or they silently drop a real sale.
    const onlineN = onlineRecs.filter(r => r.image).length;
    return { houseReceipts, houseN: houseReceipts.length, onlineN, onlineReceiptsN: onlineRecs.length, totalN: priced.length };
  } catch (e) { return null; }
}

// Comp price RANGE for a resolved vehicle, archive-only (sales_archive), ZERO OldCarsData spend.
// Powers the /sell price-step transparency affordance (#68): when a seller DEFERS the asking
// price, Sam shows THE RECORD - the real range cars like this sold for over the standard window -
// and NEVER a single number. NO median, NO midpoint EVER: a lone figure a seller is invited to
// adopt is a valuation whatever the sentence around it says (locked house rule). Uses the SAME
// 36-month window (HT_WINDOW_DAYS) and qualifying gates as the thin/class-era result band, and
// NEVER widens the window to manufacture a spread - too thin returns ok:false so the caller says
// so honestly. Edges mirror the class-era band (p10-p90 bulk at n>=8, min-max for a small pool) so
// a raw outlier never over-claims. Returns only {ok,count,low,high,windowMonths,currency,poolLabel}
// - deliberately NO median field, so a midpoint can never leak into copy.
const PRICE_RANGE_MIN = 5; // below this there is no honest spread; say so, never widen to fake one
export async function priceBandForVehicle(vehicle, generation, env) {
  try {
    if (!vehicle || !vehicle.make || !vehicle.model || !env) return { ok: false, reason: "unscopable" };
    const searchText = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
    const spec = buildSpec(vehicle, generation, searchText);
    if (!spec || !spec.make) return { ok: false, reason: "unscopable" };
    // Scope the pool to the seller's ACTUAL config. A named trim not already scoped by a
    // performance badge filters the archive TITLE, so a "250 GT Lusso" reads Lussos (and
    // honestly thins when there are too few) instead of pooling the whole 250 GT family
    // (a Lusso priced next to a GTO) - pooling the family to manufacture a spread is exactly
    // the "widen to fake a range" the price-record rule forbids.
    const trimTok = vehicle.trim && String(vehicle.trim).trim() ? String(vehicle.trim).trim() : "";
    if (trimTok && !spec.titleContains && !spec.perfInclude && !spec.badge) spec.titleContains = trimTok;
    const sinceIso = new Date(obNow() - HT_WINDOW_DAYS * 864e5).toISOString();
    const rows = await fetchQualifying(spec, sinceIso, env, {});
    // Chassis-code union: the archive files modern 911s under "991"/"997", not the "911"
    // nameplate, so a bare-nameplate scope reads thin. When the generation names a chassis
    // code, also pull that code's pool (SAME year + trim scope) and union by id, so a "2018
    // 911 Carrera GTS" reads the 991 GTS sales. NOT a window-widen (same 36 months, same
    // trim) - just the archive's other spelling of the same car.
    const codeTok = generationModelToken(generation);
    if (rows.length < 8 && codeTok && codeTok.toLowerCase() !== String(spec.model || "").toLowerCase()) {
      const more = await fetchQualifying({ ...spec, model: codeTok }, sinceIso, env, {});
      const seen = new Set(rows.map(r => r.id));
      for (const r of more) if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }
    }
    // Drop project/incomplete/shell cars (item 1) so a shell never sets a range edge for a running car.
    const complete = await filterProjectRows(rows, env);
    const values = complete.map(r => Number(r.value)).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    const windowMonths = Math.round(HT_WINDOW_DAYS / 30.4);
    if (values.length < PRICE_RANGE_MIN) return { ok: false, reason: "thin", count: values.length, windowMonths };
    const round = n => { const step = n >= 100000 ? 5000 : n >= 25000 ? 1000 : 500; return Math.round(n / step) * step; };
    const low = round(values.length >= 8 ? percentile(values, 0.1) : values[0]);
    const high = round(values.length >= 8 ? percentile(values, 0.9) : values[values.length - 1]);
    if (!(high > low)) return { ok: false, reason: "thin", count: values.length, windowMonths }; // no degenerate single-point "range"
    return { ok: true, count: values.length, low, high, windowMonths, currency: "USD",
      poolLabel: nameplate(spec.model, spec.trim) || [vehicle.make, vehicle.model].filter(Boolean).join(" ") };
  } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
}

// Per-transaction listing for a resolved vehicle, archive-only (sales_archive), ZERO OldCarsData.
// Returns every qualifying SOLD transaction (the archive is sold-only by construction) over a
// caller-chosen window, with the raw fields for manual verification: date, price (USD hammer +
// native), mileage, platform, title, transmission, url. Trim-scoped like priceBandForVehicle
// (never widened to the family) plus the chassis-code union. The CALLER applies any finer spec
// filter (engine/variant/market) from the titles - this only scopes to make/model/trim/year.
export async function listSalesForVehicle(vehicle, generation, env, sinceDays) {
  try {
    if (!vehicle || !vehicle.make || !vehicle.model || !env) return { ok: false, reason: "unscopable", sales: [] };
    const searchText = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
    const spec = buildSpec(vehicle, generation, searchText);
    if (!spec || !spec.make) return { ok: false, reason: "unscopable", sales: [] };
    const trimTok = vehicle.trim && String(vehicle.trim).trim() ? String(vehicle.trim).trim() : "";
    if (trimTok && !spec.titleContains && !spec.perfInclude && !spec.badge) spec.titleContains = trimTok;
    const days = Number(sinceDays) > 0 ? Number(sinceDays) : HT_WINDOW_DAYS;
    const sinceIso = new Date(obNow() - days * 864e5).toISOString();
    const rows = await fetchQualifying(spec, sinceIso, env, {});
    const codeTok = generationModelToken(generation);
    if (codeTok && codeTok.toLowerCase() !== String(spec.model || "").toLowerCase()) {
      const more = await fetchQualifying({ ...spec, model: codeTok }, sinceIso, env, {});
      const seen = new Set(rows.map(r => r.id));
      for (const r of more) if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }
    }
    const sales = rows.map(r => ({
      date: r.auction_end_date || null,
      priceUsd: Number(r.value) || null,
      priceNative: Number(r.price) || null,
      currency: r.currency || "USD",
      mileage: r.mileage != null ? Number(String(r.mileage).replace(/[^\d.]/g, "")) || null : null,
      platform: r.source || null,
      title: r.raw_title || r.rtitle || null,
      transmission: r.transmission || null,
      year: r.year || null,
      url: r.srcurl || r.srcurl2 || null
    })).filter(s => s.priceUsd > 0).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { ok: true, windowDays: days, count: sales.length,
      poolLabel: nameplate(spec.model, spec.trim) || [vehicle.make, vehicle.model].filter(Boolean).join(" "), sales };
  } catch (e) { return { ok: false, reason: String((e && e.message) || e), sales: [] }; }
}

// ---- RUNG 4/5 for callers outside runOneBoxCore (Round 5 Lane B job, Oct 2026) --------
// DELETED this round: the CLASS-ERA rung (assessClassEra/classEraGuarded/assessClassEraForVehicle,
// Part 1, Sep 2026) and its "same marque within the car's decade era band" fallback. It answered
// from OTHER CARS - the wider marque/era population, never this car's own cohort - which is exactly
// what this round's brief (the model-first ladder) rules out: "never knowingly answer the wrong
// version of the car." Replaced below by a standalone version of the SAME rung 4/5 rescue
// runOneBoxCore's own closure (anyYearOrSiblingRescue, see runOneBox above) uses - same model at
// any year, then a named sibling (lib/modelRules.js SIBLING_MODELS) - for the two callers that
// previously called assessClassEraForVehicle from outside runOneBoxCore: lib/sell/sellFacts.js and
// api/sellerDecision.js. No second path: both rungs are "this car's own cohort, just widened",
// never a different marque's cars standing in for this one.
export async function anyYearOrSiblingForVehicle(vehicle, generation, env) {
  try {
    if (!vehicle || !vehicle.make || !vehicle.model || !env) return null;
    const spec = buildSpec(vehicle, generation, [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" "));
    if (!spec || !spec.make || !spec.model) return null;
    const trimName = spec.trim && String(spec.trim).trim() ? String(spec.trim).trim() : null;
    const trimRe = trimName ? trimTitleRe(trimName) : null;
    const since1825 = new Date(obNow() - 1825 * 864e5).toISOString().slice(0, 10);
    // self (Round 5 Lane B job, Oct 2026, CLK DTM fix): the queried car's OWN model+trim text, so
    // recordExcludeReason's self-aware DTM/halo suppression never excludes a car's own factory name
    // (CLK DTM) as a race car or halo - see the DTM_RACE_RE comment on recordExcludeReason.
    // model/year params (added alongside the CLK DTM fix): intrinsicAmgFor-aware, the SAME
    // narrowing runOneBox's own ladder already applies (a model whose own name intrinsically
    // carries AMG/DTM - SLS AMG, CLK55 AMG, CLK DTM - must never have the broad make-halo empty
    // its whole pool; only a variant genuinely ABOVE it, Black Series, is still a halo).
    const priceAndFence = (rows, make, model, self) => {
      const haloRe = intrinsicAmgFor(make, model, null) ? /\bblack\s?series\b/i : haloMatcherFor(make);
      return rows
        .filter(r => { r._usd = outcomeUsd(r); return Number.isFinite(r._usd) && r._usd > 0; })
        .filter(r => !r._tag && !(haloRe && haloRe.test(titleOf(r))) && !recordExcludeReason(r, make, { wantHalo: true, self }));
    };
    // Same model, any year (trim kept, then dropped).
    if (trimName) {
      const raw = await fetchQualifying({ ...spec, titleContains: trimName, yearMin: null, yearMax: null }, since1825, env, {});
      const rows = priceAndFence(raw, spec.make, spec.model, `${spec.model} ${trimName}`).filter(r => trimRe.test(titleOf(r)));
      if (rows.length >= 3) return { receipts: rows.map(htReceipt), pool: withUsd(rows), siblingName: null, label: `${spec.model} ${trimName}, all years` };
    }
    const rawModel = await fetchQualifying({ ...spec, trim: null, titleContains: null, yearMin: null, yearMax: null }, since1825, env, {});
    let modelRows = priceAndFence(rawModel, spec.make, spec.model, spec.model);
    // TITLE-KEYWORD FALLBACK (Round 5 Lane B job, Oct 2026): same reasoning as the identical fix in
    // runOneBox's own closure (anyYearOrSiblingRescue) - a multi-word model name the archive files
    // as a loose phrase, not a model-column value (CLK DTM), must not dead-end on the phrase-ILIKE
    // alone. Same shared titleKeywordPool, only tried when the phrase match came up thin.
    if (modelRows.length < 3 && /\s/.test(String(spec.model || ""))) {
      const kw = await titleKeywordPool({ make: spec.make, model: spec.model, year: null, bodyStyle: spec.bodyStyle }, env, DISPLAY_FLOOR).catch(() => null);
      // kw.pool rows already carry their own computed _usd/_hammer/_allin (set below, from _hv) -
      // never recomputed through outcomeUsd/priceAndFence (a different row shape than
      // fetchQualifying's own rows), only halo/exclude-fenced, same discipline as the closure
      // version of this fix (runOneBox's anyYearOrSiblingRescue).
      const kwHaloRe = intrinsicAmgFor(spec.make, spec.model, null) ? /\bblack\s?series\b/i : haloMatcherFor(spec.make);
      const kwRows = ((kw && kw.pool) || [])
        .map(r => ({ ...r, _usd: r._hv, _hammer: r._hv, _allin: r._hv, currency: "USD", transmission: null }))
        .filter(r => Number.isFinite(r._usd) && r._usd > 0 && !(kwHaloRe && kwHaloRe.test(titleOf(r))) && !recordExcludeReason(r, spec.make, { wantHalo: true, self: spec.model }));
      if (kwRows.length) {
        const seen = new Set(modelRows.map(r => r.id));
        modelRows = [...modelRows, ...kwRows.filter(r => !seen.has(r.id))];
      }
    }
    if (modelRows.length >= 3) return { receipts: modelRows.map(htReceipt), pool: withUsd(modelRows), siblingName: null, label: `${spec.model}, all years` };
    // Named sibling model.
    const sib = siblingModelFor(spec.make, spec.model, spec.trim);
    if (sib) {
      const rawSib = await fetchQualifying({ ...spec, make: sib.make, model: sib.model, trim: null, titleContains: null, badge: null, yearMin: null, yearMax: null }, since1825, env, {});
      const sibRows = priceAndFence(rawSib, sib.make, sib.model, sib.model);
      if (sibRows.length >= 3) return { receipts: sibRows.map(htReceipt), pool: withUsd(sibRows), siblingName: sib.label, label: `Closest: ${sib.label}` };
    }
    return null;
  } catch (e) { return null; }
}

// ---- Sam's Take (v1, Sep 2026): a pattern read of the STRONGER half vs the WEAKER half of the
// sales behind a One Box range, on DATED listing snapshots. Pattern never cause, and never a figure
// for the user's own car. Every attribute here is "as listed at the time of sale". No extraction
// pipeline: the values already ride on the qualifying rows (raw_record->> extractions on the
// non-record fetchQualifying select). Returns a structured result + a first-person sentence, or null
// when the pool is too thin to compare honestly.
const ST_MIN_PER_SIDE = 8;   // each half needs >=8 sales WITH the attribute present, else skip it
const ST_MILEAGE_REL = 0.25; // mileage medians must be >=25% apart to count as separated
const ST_SHARE_PTS = 20;     // shares must be >=20 points apart
const ST_FLAW_ABS = 2;       // known-flaw median counts must be >=2 apart
const ST_MOD_HEADER = /^(notable\s+)?modifications?\b[^.]*\b(include|reported|according)\b|reported by the seller|according to the seller|^\s*modifications?\s*:?\s*$|^\s*mods?\s*:?\s*$/i;
const ST_CONVERSION = /\bconversion\b|\bconverted\b|\bswap(ped)?\b|\bretrofit(ted)?\b/i;
// FACTORY OPTIONS / PERSONALISATION are NOT modifications (bug: 7 in 10 812 GTS read as "modified").
// A car ordered with Tailor Made / Special Projects / Paint-to-Sample / Manufaktur / designo /
// Individual / Exclusive, or carrying a factory livery / stripes / optional wheels, is a FACTORY-spec
// car, not a modified one. These list items are dropped from the real-mods count.
const ST_FACTORY_OPTION = /\btailor[-\s]?made\b|\bspecial\s?projects?\b|\batelier\b|\bpaint[\s-]?to[\s-]?sample\b|\bPTS\b|\bmanufaktur\b|\bdesigno\b|\bindividual\b|porsche\s?exclusive|\bexclusive\s+(?:manufaktur|interior|leather|program\w*)\b|\blivery\b|\bstripe[sd]?\b|\bdecals?\b|\bfactory\s+option|\b(?:wheel\s+options?|option(?:al)?\s+wheels?)\b|\bpts\s|\bspec(?:ial)?\s?order\b/i;
// PROTECTIVE / CONVENIENCE add-ons are not modifications for comparison purposes: paint protection
// film (PPF / clear bra / Xpel), ceramic coating, window tint, radar/laser detector, dash cam,
// alarm/tracker, the factory front-axle (nose) lift, plate frames, floor mats, battery tender. Note the
// lift pattern is scoped to front-axle/nose lifts (the supercar factory option) so a genuine off-road
// "suspension lift kit" is never swept up.
const ST_CONVENIENCE = /paint[\s-]?protection|\bppf\b|clear\s?bra|\bxpel\b|ceramic\s?coat|tinted?\s?windows?|window\s?tint|radar\s?detector|laser\s?detector|dash\s?cam|\balarm\b|\btracker\b|tracking\s?(?:device|system)|gps\s?track|front[\s-]?axle(?:\s+suspension)?\s+lift|nose\s?lift|hydraulic\s+(?:nose\s+)?lift|plate\s?frames?|license\s?plate|floor\s?mats?|battery\s?(?:tender|maintainer|conditioner)|trickle\s?charger/i;
// FACTORY EQUIPMENT that upstream feeds often lump into the "modifications" list but which ships from
// the factory: adaptive/magnetorheological suspension, rear-wheel steering, adaptive headlights,
// surround/parking/back-up cameras, heated or power-adjustable seats, the GTS retractable hardtop, the
// factory fender shields. None of these is an aftermarket modification.
const ST_FACTORY_EQUIP = /magnetorheolog|magne[\s-]?ride|adaptive\s?(?:suspension|dampers?|headlights?)|rear[\s-]?wheel\s?steer\w*|four[\s-]?wheel\s?steer\w*|\b4ws\b|\bsbl\b|surround[\s-]?view|parking\s?camera|back[\s-]?up\s?camera|rear[\s-]?view\s?camera|360[\s-]?(?:degree\s?)?camera|heated\s[\w\s-]*seats?|power[\s-]?adjustable|electronically\s?operated\s?hardtop|retractable\s?hardtop|power\s?hardtop|fender\s?shields?/i;
// REVERSIBLE COSMETIC that returns the car to stock and is not a permanent modification: a vinyl wrap
// (peels off), and recolouring of the EXISTING wheels/calipers (refinished / repainted / powder-coated).
// A genuine aftermarket WHEEL SWAP is NOT matched here (it is a real mod unless the originals are kept,
// which the mods field alone cannot tell us) - only recolouring of the car's own wheels is swept up.
const ST_REVERSIBLE = /\bwrap(?:ped|s)?\b|vinyl\s?wrap|(?:wheels?|rims?)\s+(?:have\s+been\s+|were\s+|been\s+)?(?:re)?(?:finished|painted|powder[\s-]?coated|refurbished)|calipers?\s+(?:have\s+been\s+|were\s+)?painted|refinished\s+in\b/i;
function stMedian(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
// A raw_record->> jsonb array comes back as JSON TEXT; parse to an array of item strings. Handles a
// plain string (newline/semicolon list), an array of strings, or an array of objects.
function stParseList(v) {
  if (v == null) return null;
  let arr = v;
  if (typeof v === "string") { const t = v.trim(); if (!t || t === "[]" || t === "null") return t === "[]" ? [] : null; try { const p = JSON.parse(t); arr = Array.isArray(p) ? p : [p]; } catch (_) { arr = t.split(/\r?\n|;/); } }
  if (!Array.isArray(arr)) arr = [arr];
  return arr.map(it => {
    if (it == null) return "";
    if (typeof it === "object") return String(it.item || it.text || it.description || it.detail || it.name || it.value || it.service || JSON.stringify(it));
    return String(it);
  }).map(s => s.trim()).filter(Boolean);
}
// A genuine MODIFICATION only: drop the header line, factory options, protective/convenience add-ons
// (PPF, ceramic, tint, radar detector, dash cam, alarm, nose lift, floor mats, battery tender) and
// factory equipment (magneride, rear-wheel steering, cameras, power seats, hardtop). What remains is
// real: engine, exhaust, tune, suspension, aftermarket wheels, body kits, appearance wraps, swaps.
function stRealMods(v) { const a = stParseList(v); if (a == null) return null; return a.filter(s => !ST_MOD_HEADER.test(s) && !ST_FACTORY_OPTION.test(s) && !ST_CONVENIENCE.test(s) && !ST_FACTORY_EQUIP.test(s) && !ST_REVERSIBLE.test(s)); }
function stTxClass(txText, mods) {
  const t = String(txText || "").toLowerCase();
  if (ST_CONVERSION.test(t) || (mods && mods.some(s => ST_CONVERSION.test(s)))) return "conversion";
  const man = /\bmanual\b|\bstick\b|\bmt\b|\bm\/t\b|\bmanuel\b/.test(t);
  const auto = /\bautomatic\b|\bauto\b|\ba\/t\b|\bpdk\b|\bdct\b|\bdsg\b|tiptronic|sequential|paddle|\bslushbox\b|dual[- ]?clutch/.test(t);
  if (man && !auto) return "manual";
  if (auto && !man) return "automatic";
  return "unknown";
}
// Most recent 4-digit year mentioned in a service item (items are usually free text like
// "Serviced in 2023: ..."). Used only to test "within 2 years of the sale".
function stItemYear(s) { const m = String(s).match(/\b(19|20)\d{2}\b/g); if (!m) return null; return Math.max(...m.map(Number)); }
// Years found across a recent_service_history value, robust to string OR object items (an object may
// carry the date in date/service_date/performed_at/year and the year may also be embedded in text).
function stServiceYears(v) {
  if (v == null) return [];
  let arr = v;
  if (typeof v === "string") { const t = v.trim(); if (!t || t === "null") return []; try { const p = JSON.parse(t); arr = Array.isArray(p) ? p : [p]; } catch (_) { arr = t.split(/\r?\n|;/); } }
  if (!Array.isArray(arr)) arr = [arr];
  const yrs = [];
  for (const it of arr) {
    if (it == null) continue;
    let text = typeof it === "object" ? [it.date, it.service_date, it.performed_at, it.year, it.item, it.text, it.description, it.detail, it.service].filter(x => x != null).join(" ") : String(it);
    const y = stItemYear(text); if (y) yrs.push(y);
  }
  return yrs;
}
export function samsTake(solid) {
  try {
    const rows = (solid || []).filter(r => Number.isFinite(r._usd) && r._usd > 0);
    // Attribute presence per row (as-listed snapshot fields).
    const attr = r => {
      const mileage = Number(r.mileage) > 0 ? Number(r.mileage) : null;
      const mods = stRealMods(r.mods);                       // null = no modifications field at all
      const tx = stTxClass(r.transmission, mods);           // manual | automatic | conversion | unknown
      const flaws = stParseList(r.flaws);                   // null = no known_flaws field
      const svc = stParseList(r.svc);                       // null = no recent_service_history field
      const has = mileage != null || tx !== "unknown" || flaws != null || svc != null || mods != null;
      return { mileage, tx, mods, flaws, svc, has };
    };
    const tagged = rows.map(r => ({ r, a: attr(r) }));
    // (d) Sales with NO listing detail (house sales, mostly) stay in the range but are left out of
    // the comparison. Count them and, if they are all houses, say so.
    const noData = tagged.filter(t => !t.a.has);
    const excluded = noData.length;
    const excludedAllHouse = excluded > 0 && noData.every(t => isHouseSource(t.r.source));
    const comparable = tagged.filter(t => t.a.has);
    if (comparable.length < ST_MIN_PER_SIDE * 2) return null;   // too thin to split into two real halves
    // (a) Split by hammer price into a weaker (lower) and a stronger (upper) half. Odd count drops
    // the single median sale so both halves are clean and equal.
    comparable.sort((x, y) => x.r._usd - y.r._usd);
    const n = comparable.length, mid = Math.floor(n / 2);
    const weaker = comparable.slice(0, mid), stronger = comparable.slice(n - mid);
    const S = stronger.map(t => t.a), W = weaker.map(t => t.a);

    const out = { ok: true, poolN: n, excluded, excludedLabel: excludedAllHouse ? "house sales" : "sales", strongerN: stronger.length, weakerN: weaker.length, attributes: {}, separated: [], notSeparated: [], conversions: { stronger: S.filter(a => a.tx === "conversion").length, weaker: W.filter(a => a.tx === "conversion").length } };

    // (b) mileage: median of present values (ignore 0 and null). (c) >=25% apart.
    {
      const sv = S.map(a => a.mileage).filter(v => v > 0), wv = W.map(a => a.mileage).filter(v => v > 0);
      if (sv.length >= ST_MIN_PER_SIDE && wv.length >= ST_MIN_PER_SIDE) {
        const ms = stMedian(sv), mw = stMedian(wv);
        const sep = Math.abs(ms - mw) / Math.max(1, Math.min(ms, mw)) >= ST_MILEAGE_REL;
        out.attributes.mileage = { compared: true, present: { stronger: sv.length, weaker: wv.length }, strongerMedian: Math.round(ms), weakerMedian: Math.round(mw), separated: sep };
        if (sep) out.separated.push("mileage");
        else out.notSeparated.push("mileage");
      } else out.attributes.mileage = { compared: false };
    }
    // (b) transmission: share manual among {manual, automatic} (conversions excluded, labelled). (c) >=20 pts.
    {
      const sBase = S.filter(a => a.tx === "manual" || a.tx === "automatic"), wBase = W.filter(a => a.tx === "manual" || a.tx === "automatic");
      if (sBase.length >= ST_MIN_PER_SIDE && wBase.length >= ST_MIN_PER_SIDE) {
        const ss = sBase.filter(a => a.tx === "manual").length / sBase.length, ws = wBase.filter(a => a.tx === "manual").length / wBase.length;
        const sep = Math.abs(ss - ws) * 100 >= ST_SHARE_PTS;
        out.attributes.transmission = { compared: true, present: { stronger: sBase.length, weaker: wBase.length }, strongerManualShare: Math.round(ss * 100), weakerManualShare: Math.round(ws * 100), separated: sep };
        if (sep) out.separated.push("transmission");
        else out.notSeparated.push("transmission");
      } else out.attributes.transmission = { compared: false };
    }
    // known_flaws REMOVED from the comparison (Sam's Take wording job, Oct 2026): sampled live via a
    // temporary ops diagnostic (task=flawsample) before deciding. The field itself IS a clean, OCD-
    // provided JSON array (not our own newline-splitting guesswork) - e.g. ["Rust on the door sills",
    // "Touched-up chips on the exterior", "Oil leaks", ...]. But its ITEM COUNT conflates how
    // thoroughly a particular seller chose to itemize minor cosmetic notes with how flawed the car
    // actually is: one seller bullets five trivial items separately, another lumps the same condition
    // into "a few minor cosmetic flaws" as one bullet - the array length differs though the car does
    // not. That is exactly the "a count taken from seller text is not reliable enough for a headline
    // sentence" case; there is no solid basis for comparing two sellers' array lengths as a severity
    // signal, so the comparison (and its sentence) is removed rather than shown. ST_FLAW_ABS is now
    // unused and kept only as a historical constant in case this is revisited with a different basis
    // (e.g. comparing severity-tagged items, not raw count).
    // (b) recent_service_history: share with an item dated within 2 years of the sale. (c) >=20 pts.
    {
      const withYear = t => { const yrs = stServiceYears(t.r.svc); if (!yrs.length) return null; const saleYr = Number(String(t.r.auction_end_date || "").slice(0, 4)); if (!saleYr) return null; const mostRecent = Math.max(...yrs); return (saleYr - mostRecent) <= 2 && mostRecent <= saleYr; };
      const sVals = stronger.map(withYear).filter(v => v !== null), wVals = weaker.map(withYear).filter(v => v !== null);
      if (sVals.length >= ST_MIN_PER_SIDE && wVals.length >= ST_MIN_PER_SIDE) {
        const ss = sVals.filter(Boolean).length / sVals.length, ws = wVals.filter(Boolean).length / wVals.length;
        const sep = Math.abs(ss - ws) * 100 >= ST_SHARE_PTS;
        out.attributes.service = { compared: true, present: { stronger: sVals.length, weaker: wVals.length }, strongerShare: Math.round(ss * 100), weakerShare: Math.round(ws * 100), separated: sep };
        if (sep) out.separated.push("service");
        else out.notSeparated.push("service");
      } else out.attributes.service = { compared: false };
    }
    // (b) modifications: share with any real modification (header lines stripped). (c) >=20 pts.
    {
      const sBase = S.filter(a => a.mods != null), wBase = W.filter(a => a.mods != null);
      if (sBase.length >= ST_MIN_PER_SIDE && wBase.length >= ST_MIN_PER_SIDE) {
        const ss = sBase.filter(a => a.mods.length > 0).length / sBase.length, ws = wBase.filter(a => a.mods.length > 0).length / wBase.length;
        const sep = Math.abs(ss - ws) * 100 >= ST_SHARE_PTS;
        out.attributes.modifications = { compared: true, present: { stronger: sBase.length, weaker: wBase.length }, strongerShare: Math.round(ss * 100), weakerShare: Math.round(ws * 100), separated: sep };
        if (sep) out.separated.push("modifications");
        else out.notSeparated.push("modifications");
      } else out.attributes.modifications = { compared: false };
    }

    const anyCompared = Object.values(out.attributes).some(a => a.compared);
    if (!anyCompared) return null;   // (e) too thin to compare on anything -> return nothing

    // (e) PLAIN pattern sentence(s): the top one or two separating attributes, each a self-contained
    // "higher half ... lower half" clause (pattern, never cause). At most two, so the hard <=2 sentence
    // / <=30 word cap in enforceSamsTake is met without compaction; a third would be dropped there. No
    // "what separated the stronger sales" framing (it read awkwardly and doubled "stronger"/"sales").
    let sentence;
    if (out.separated.length) {
      const plain = out.separated.map(k => stPlainClause(k, out.attributes)).filter(Boolean);
      sentence = (plain.slice(0, 2).join(" ") || "").trim();
    } else {
      sentence = "Nothing cleanly separated the higher and lower halves of sales on the listing details.";
    }
    out.sentence = sentence;
    return out;
  } catch (e) { return null; }
}

// Sam's Take copy discipline (Part 3 item 6), enforced in CODE, never trusted to the writer:
//  - at most TWO sentences and THIRTY words;
//  - a banned-word lint (valuation / causal / predictive language);
//  - a compact rebuild from the strongest SEPARATING clause so the sentence fits the cap instead of
//    being dropped for length.
// Returns { ok, sentence, reason }. On any failure the caller drops the Take and logs the reason.
// ROOT CAUSE FIX (addendum, Oct 2026): this server-side gate and js/onebox.js's own client-side
// LINT_BANNED check are two SEPARATE banned-word lists for the same copy rule, and they had drifted
// out of sync - "averaged"/"average"/"mean"/"median" were on the client list (a broad net over every
// surface's copy) but never on this one (Sam's Take specifically), so a violating sentence rendered
// server-side and was only caught, after the fact, as a client console error (the "averaged ... 47,000
// miles" line). The wording is fixed at its source (stPlainClause below); this list is widened so the
// same class of word can never pass this gate again, not just be logged once it already has.
const ST_BANNED = /\b(because|due to|drives?|will|should|expect(?:s|ed)?|likely|worth|average[sd]?|averaging|mean|median)\b/i;
function stWordCount(s) { return String(s || "").trim().split(/\s+/).filter(Boolean).length; }
function stSentenceCount(s) { return (String(s || "").match(/[.!?]+(?=\s|$)/g) || []).length; }
// PLAIN Take clause per attribute (Part 3 copy fix): one self-contained sentence comparing the HIGHER
// half of sales (by price) with the LOWER half, stated as a pattern, never a cause. Reads off the
// attributes object (shares are 0-100 integers; medians already rounded). The old "the stronger half
// showed X against Y" wording repeated "stronger"/"sales" and read awkwardly; this is the one source
// of truth for every Take template, used by both the full sentence and the compact rebuild so they
// can never diverge again.
const ST_NUMWORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const stNum = n => (n >= 0 && n <= 10 ? ST_NUMWORD[n] : String(n));
function stPlainClause(key, a) {
  if (!a) return null;
  const r1k = v => Math.round(v / 1000) * 1000;
  const inTen = share => Math.round(share / 10);     // shares arrive as 0-100 integers
  // WORDING FIX (comparable-fences job, Oct 2026): "the higher half"/"the lower half" read as mileage
  // (or whatever attribute the sentence names), not price, since the split itself is never stated in
  // the sentence - a reader has no way to know "higher"/"lower" means price. Every clause below now
  // says "higher-priced sales"/"lower-priced sales" explicitly, the exact phrasing requested.
  // WORDING FIX (addendum, Oct 2026): "averaged" implied a mean over a figure that is actually a
  // MEDIAN (strongerMedian/weakerMedian) - the client-side copy lint (js/onebox.js LINT_BANNED)
  // catches this class of word on purpose and logs a console error, exactly as it did here. The fix
  // is the wording, not the lint: "typically around" states a median honestly, same numbers.
  if (key === "mileage" && a.mileage) return `Higher-priced sales were typically around ${r1k(a.mileage.strongerMedian).toLocaleString("en-US")} miles; lower-priced sales around ${r1k(a.mileage.weakerMedian).toLocaleString("en-US")}.`;
  if (key === "transmission" && a.transmission) return `Higher-priced sales were ${inTen(a.transmission.strongerManualShare)} in 10 manual; lower-priced sales ${inTen(a.transmission.weakerManualShare)} in 10.`;
  if (key === "service" && a.service) return `Higher-priced sales had a recent service record ${inTen(a.service.strongerShare)} in 10; lower-priced sales ${inTen(a.service.weakerShare)} in 10.`;
  // Modifications in PLAIN words (bug 2), never "0 in 10": lead with the side that was modified more.
  // "Most of the lower-priced sales had been modified; none of the higher-priced ones had." Shares 0-100.
  if (key === "modifications" && a.modifications) {
    const desc = p => p >= 88 ? "all" : p >= 55 ? "most" : p >= 33 ? "about half" : p >= 12 ? "some" : "none";
    const hi = a.modifications.strongerShare, lo = a.modifications.weakerShare;
    const hiMore = hi >= lo;
    const s1 = hiMore ? "higher-priced" : "lower-priced", d1 = desc(hiMore ? hi : lo);
    const s2 = hiMore ? "lower-priced" : "higher-priced", d2 = desc(hiMore ? lo : hi);
    return `${d1.charAt(0).toUpperCase() + d1.slice(1)} of the ${s1} sales had been modified; ${d2} of the ${s2} ones had.`;
  }
  return null;
}
function enforceSamsTake(raw) {
  if (!raw || !raw.sentence) return { ok: false, reason: "no take produced" };
  // Prefer the already-assembled sentence; if it blows the cap, rebuild to the strongest clause.
  let sentence = String(raw.sentence).trim();
  if (stWordCount(sentence) > 30 || stSentenceCount(sentence) > 2) {
    const clause = stPlainClause((raw.separated || [])[0], raw.attributes || {});
    if (!clause) return { ok: false, reason: "no separating pattern to compact to" };
    sentence = clause;
  }
  if (stWordCount(sentence) > 30) return { ok: false, reason: "take exceeds 30 words" };
  if (stSentenceCount(sentence) > 2) return { ok: false, reason: "take exceeds two sentences" };
  const m = sentence.match(ST_BANNED);
  if (m) return { ok: false, reason: `banned word "${m[0].toLowerCase()}"` };
  return { ok: true, sentence };
}

// ================================================================================================
// MARKET CHECK ENGINE ADDITIONS (Oct 2026). One engine: these live here so Buy's panel, Sell and
// the landing example all inherit them through the SAME runOneBox call, never a second copy per
// surface. No valuation words, no median anywhere in output (an internal gate value is fine; it is
// never returned), no em or en dashes in any string. Every field below is null when its gate fails,
// never a placeholder - a reader can always tell "we checked and there is nothing" from "we have not
// built this yet".

// Shared number helper (item 1): a count under ten reads as a word (the way a person says it -
// "nine sold", never "9 sold"); ten and up stays the plain number so a consumer can still sort or
// compare without parsing a string. Reuses ST_NUMWORD (defined with samsTake below), not a second
// word list.
const countWord = n => (Number.isFinite(n) && n >= 0 && n < 10) ? ST_NUMWORD[n] : n;

// PLACING (item 5): the one wording for where a figure sits against a band, used anywhere a figure
// is judged against a typical-band pair (the live panel, Buy's drawer, the before-it-ends message).
// Null-safe - no real band, no placing (never a guess dressed up as a read).
export function placingFor(value, band) {
  if (!Number.isFinite(value) || !Array.isArray(band) || band.length !== 2 || !Number.isFinite(band[0]) || !Number.isFinite(band[1])) return null;
  if (value < band[0]) return "below the range";
  if (value > band[1]) return "above the range";
  return "inside the range";
}

// RANGE_THRESHOLD (items 2 and 3): the same 8-sale floor rangeTierForCount uses for a real band
// (cluster at 16+, band at 8-15; below 8 there is no typical band of any kind, only the sales
// themselves). Shared so a quarter or a year-over-year side either clears the same bar the headline
// does, or honestly returns the sales list / null instead of a guessed band.
const RANGE_THRESHOLD = 8;

// Quarterly bands (item 2): the 12-month pool only (null when the headline widened past it - a
// pool thin enough to need two years has no honest way to slice four quarters of it). Four
// calendar quarters, newest first, each read the SAME way the headline is (r4Split then r4Cluster -
// the identical price-fence and typical-band method, not a second one). A quarter below the range
// threshold returns its own sales list instead of a band - the real cars, never a guessed number.
// covered (job 7 fix, Oct 2026): a COVERED model's headline solid/aside split is r._tag alone (rule5
// PoolGuard, never r4Split's price-percentile fence - see buildResult). Re-running r4Split on each
// quarter's small sample for a covered model applied a SECOND, different, noisier fence on top (a
// price-percentile cut is far more volatile on a quarter's worth of rows than the whole pool), so the
// four quarters could sum to fewer sales than the headline even though both started from the same
// already-tag-fenced recentRows (confirmed live: 2005 BMW M3 Coupe headline 87 sales, quarters summed
// to 63). For a covered model the rows handed in are already fully fenced (recentFenced in
// buildResult excludes every _tag), so skip r4Split and use them directly. An uncovered model keeps
// calling r4Split per quarter, unchanged - that re-derivation IS the shared method for a model with no
// curated guard.
// TRAILING THREE-MONTH PERIODS (job 4, Oct 2026 addendum, REPLACES calendar quarters): the old
// version bucketed by CALENDAR quarter counted back from today (Jan-Mar, Apr-Jun, ...), which does
// not line up with the headline's own ROLLING twelve-month window - the window actually starts on
// `windowStart` (the real earliest sale date in the pool), not on a calendar quarter boundary, so a
// chunk of the headline's own pool (confirmed live: the October-to-December 2025 slice of a window
// that started mid-October 2025) fell OUTSIDE every one of the four calendar buckets and the rows
// never summed to the headline count (87 headline vs 71, then 79 vs 89 on different cars - the SAME
// bug, not two). This version partitions the EXACT span windowStart-to-now into four trailing
// periods by day count (Math.floor so every row lands in exactly one bucket, no gaps, no overlap,
// the oldest period absorbing any remainder day when the span does not divide evenly by 4) - so the
// four periods' rows are a true partition of `solid`, and their counts always sum to solid.length
// exactly, by construction, not by coincidence.
//
// RANGE_THRESHOLD (8) floor (job 10): a period below it is OMITTED ENTIRELY - no thin flag, no empty
// row, per Sam's explicit instruction ("no thin flag, no empty row"). Omitting it would otherwise
// silently break "rows sum to headline count", so every omitted period's count is folded into
// `rowsNotShownCount` instead, returned alongside the visible periods - the page can say "N more
// sales in thinner periods" and the arithmetic (sum of shown + rowsNotShownCount === headline count)
// always holds, never hidden.
function tradingPeriodsFor(solid, windowStart, nowIso, useRecent) {
  if (!useRecent || !windowStart) return null;
  const DAY_MS = 864e5;
  const nowDay = Math.floor(Date.parse(nowIso.slice(0, 10) + "T00:00:00Z") / DAY_MS);
  const startDay = Math.floor(Date.parse(windowStart.slice(0, 10) + "T00:00:00Z") / DAY_MS);
  const totalDays = nowDay - startDay + 1;
  if (!(totalDays > 0)) return null;
  const bucketDays = Math.ceil(totalDays / 4);
  const buckets = [[], [], [], []];
  for (const r of solid) {
    const d = String(r.auction_end_date || "").slice(0, 10);
    if (!d) continue;
    const rDay = Math.floor(Date.parse(d + "T00:00:00Z") / DAY_MS);
    const idx = Math.min(3, Math.floor((nowDay - rDay) / bucketDays));
    if (idx >= 0) buckets[idx].push(r);
  }
  const periods = [];
  let rowsNotShownCount = 0;
  for (let i = 0; i < 4; i++) {
    const rows = buckets[i];
    const hiDay = nowDay - i * bucketDays, loDay = i === 3 ? startDay : nowDay - (i + 1) * bucketDays + 1;
    const label = `${new Date(loDay * DAY_MS).toISOString().slice(0, 10)} to ${new Date(hiDay * DAY_MS).toISOString().slice(0, 10)}`;
    if (rows.length >= RANGE_THRESHOLD) {
      periods.push({ period: label, band: r4Cluster(rows), count: countWord(rows.length), countN: rows.length, sales: shapeCards(rows) });
    } else {
      rowsNotShownCount += rows.length;
    }
  }
  return { periods, rowsNotShownCount };
}

// Typical mileage for the year-over-year mileage-comparability gate (item 3) - an internal GATE
// value only, never returned on the result (the "no median anywhere in output" rule is about what
// comes BACK, not how a gate decides). The middle value of the solid rows with a real mileage figure.
function typicalMileageOf(rows) {
  const mi = rows.map(miOf).filter(v => v > 0).sort((a, b) => a - b);
  if (!mi.length) return null;
  const n = mi.length;
  return n % 2 ? mi[(n - 1) / 2] : (mi[n / 2 - 1] + mi[n / 2]) / 2;
}
const usd = n => "$" + Math.round(n).toLocaleString("en-US");
// Year-over-year direction (item 3): the SAME recent/prior twelve-month windows the headline's own
// direction nudge reads (r4Direction, above) - same fences (trim/body/gearbox already applied to
// `rows` before this split), but with the gates and shape this item actually asks for: both sides at
// or above the range threshold, typical mileage comparable (within 20%) so a move is not just a
// different mix of cars, and a direction only when BOTH band ends moved the same way by 5% or more
// (one end moving while the other does not is not a real shift in the typical band, it is the band
// changing shape). Percent is the whole-number average of the two end moves. Null on every gate
// failure and on a pool that widened past twelve months (`useRecent` false) - a two-year pool has no
// honest "the year before" to compare against.
function yearOverYearDirectionFor(recentRows, priorRows, keepAll, useRecent, covered) {
  if (!useRecent) return null;
  // covered: same reasoning as quarterlyBandsFor above - a covered model's rows are already fully
  // _tag-fenced by the caller, so no second r4Split price fence on top.
  const rs = covered ? recentRows : r4Split(recentRows, keepAll).solid;
  const ps = covered ? priorRows : r4Split(priorRows, keepAll).solid;
  if (rs.length < RANGE_THRESHOLD || ps.length < RANGE_THRESHOLD) return null;
  const rMi = typicalMileageOf(rs), pMi = typicalMileageOf(ps);
  if (!(rMi > 0) || !(pMi > 0) || Math.abs(rMi - pMi) / pMi > 0.20) return null;
  const recentBand = r4Cluster(rs), priorBand = r4Cluster(ps);
  if (!recentBand || !priorBand || !(priorBand[0] > 0) || !(priorBand[1] > 0)) return null;
  const loMove = (recentBand[0] - priorBand[0]) / priorBand[0];
  const hiMove = (recentBand[1] - priorBand[1]) / priorBand[1];
  const sameWay = (loMove >= 0.05 && hiMove >= 0.05) || (loMove <= -0.05 && hiMove <= -0.05);
  const base = { recentBand, priorBand, recentWindow: "the past 12 months", priorWindow: "the 12 months before that" };
  // Item 4 (Oct 2026 follow-up): name the actual windows plainly (the past 12 months, the 12 months
  // before that) instead of "this year"/"the year before", which read as calendar years - the
  // windows are rolling twelve month periods from today, not Jan to Dec.
  if (!sameWay) {
    return { ...base, status: "flat", percent: null, sentence: "Most sales in the past 12 months landed about where they did in the 12 months before that." };
  }
  const status = loMove > 0 ? "higher" : "lower";
  const percent = Math.round((Math.abs(loMove) + Math.abs(hiMove)) / 2 * 100);
  const sentence = `Most sales in the past 12 months landed about ${percent} percent ${status} than in the 12 months before that: ${usd(recentBand[0])} to ${usd(recentBand[1])} now, ${usd(priorBand[0])} to ${usd(priorBand[1])} then.`;
  return { ...base, status, percent, sentence };
}

// Set-aside reasons (item 4): every row in `aside` already carries WHY it is not in the band
// (r._tag, set a few lines below in buildResult) - bucketed into the four reasons a reader can act
// on. "project" reads zero on most pools: a project/incomplete car is caught earlier, at the fetch's
// own qualifyReason gate (lib/onebox.js), before any row reaches this pool at all - a true zero, not
// a placeholder, and the honest answer for the rows actually visible here.
function setAsideReasonFor(r) {
  const t = String(r._tag || "").toLowerCase();
  if (r.project_flag) return "project";
  if (/replica|tribute|clone|\bkit\b|restomod|continuation|recreation/.test(t)) return "replica";
  // "provenance" and "halo" are their own, non-modification reasons (an ex-celebrity/works car; a
  // genuinely different pricier variant) - unchanged from before, still read as "odd sale" rather than
  // newly misreading as a modification.
  if (t === "provenance" || t === "halo") return "odd sale";
  if (t.startsWith("variant:")) return t.slice("variant:".length);   // the variant's own words ("professional restoration", "Carrera four-cam")
  // A factory special edition the model rule sets aside (lib/modelRules.js specialEditions: Exclusive Series, Club, 50th,
  // Heritage, Scuderia...) is a limited edition, never a modification (e50, Lane C's find: the 2018 911 Turbo S
  // Exclusive Series sales read "modified").
  if (t === "special-edition") return "limited edition";
  // MODIFICATION bucket (comparable-fences job, Oct 2026): any OTHER restomodReason tag (lib/
  // modelRules.js RESTOMOD_TAGS) is a modification - was narrowly "engine swap" only; broadened so the
  // new tags (modified, widebody, bagged, lifted, stroker, built engine, twin-turbo conversion, ruf,
  // turbo look, slant-nose conversion, custom built, backdate, outlaw, reimagined, toolroom, electric/
  // ev conversion) all read as "modified", not fall through to the price-outlier "odd sale" bucket they
  // have nothing to do with. A row with NO tag at all (the untagged r4Split price-outlier case) still
  // falls through to "odd sale" below, unchanged.
  if (t) return "modified";
  return "odd sale";
}

// buildPool (job 3, pool-consistency root cause, Oct 2026): EVERY count printed on a page - the
// headline, a gearbox/competition/trim split, a chip option - must come from this ONE function, not
// a second derivation. Before this fix, the gearbox/competition QUESTION (in runOneBoxCore, called
// BEFORE buildResult) read man/auto counts off `chosen.rows` - the raw ladder-selected rows, before
// the today-first window, before provenance/engine-swap/halo set-aside, before the per-covered-model
// rule5PoolGuard tag split. The headline itself (built by buildResult, below) applies ALL of that to
// the SAME starting rows and lands on a materially smaller, different pool. Confirmed live: a 2005
// BMW M3 Coupe headline read 87 comparable sales while its gearbox split read 131 manual + 16 SMG =
// 147 from the unfenced pool - not a rounding gap, a genuinely different pool. This function is a
// PURE function of (chosen, spec, iso, refine) - same inputs, same outputs, no hidden state, no
// randomness - so calling it twice in one request (once before any question is decided, once inside
// buildResult to actually build the range) is safe and guarantees identical results BY CONSTRUCTION,
// not by two independent implementations that happen to agree today and drift apart tomorrow.
export function buildPool(chosen, base, iso, spec, refine) {
  // $2,500 CAR FLOOR (Part 3), enforced here too as a hard backstop: a sub-floor hammer is a part,
  // memorabilia or data error, never a car, so it is dropped from the pool, the range and the cards
  // regardless of whether upstream classification already excluded it (a $265 "300SL" can never
  // reach a surface). Individual CARD prices above the floor are still shown raw, never rounded.
  let rows = [...chosen.rows].filter(r => Number.isFinite(r._usd) && r._usd >= DISPLAY_FLOOR);
  // TRIM QUESTION (Oct 2026, item 2, shared engine - not page code, so Buy and Sell read the same
  // pool through the same call). When the query names NO trim and the model has a SUBTRIM_FENCES
  // group, the pool defaults to the group's BASE trims (f.base === true - for the 911, Carrera and
  // Carrera S, the pair a plain "911" ordinarily means) and every OTHER named trim is held out -
  // never silently folded in, and never excluded by a price guess (the earlier "price divergence"
  // attempt was circular: deciding membership by price, then calling the result a price outlier -
  // reverted). A query that NAMES a trim ("911 Carrera") is already scoped at fetch time
  // (subTrimFenceFor) and never reaches this block. `chosenTrimName` carries a chip-answered trim
  // into poolTrim below, the same field an exact-trim QUERY already uses to name the pool.
  let trimQuestion = null, chosenTrimName = null;
  const fenceGroup = spec.trim ? null : subTrimGroupFor(spec.make, spec.model);
  // e62: a trim chosen from the sales-derived question (value = the trim word, or "other" with the named trims it is not)
  if (!fenceGroup && refine && refine.trim && !spec.trim) {
    const want = String(refine.trim).toLowerCase();
    const not = new Set(String(refine.notTrims || "").toLowerCase().split(",").filter(Boolean));
    const word = r => { const w = rowTrimWord(r, spec); return w ? obNormWord(w) : null; };
    rows = want === "other" ? rows.filter(r => { const w = word(r); return !w || !not.has(w); }) : rows.filter(r => word(r) === want);
    chosenTrimName = want === "other" ? "Other trims" : (rows[0] ? rowTrimWord(rows[0], spec) : refine.trim);
  }
  if (fenceGroup) {
    if (refine && refine.trim) {
      const picked = fenceGroup.fences.find(f => trimSlug(f.name) === refine.trim);
      if (picked) { rows = rows.filter(r => picked.include.test(titleOf(r)) && !picked.exclude.test(titleOf(r))); chosenTrimName = picked.name; }
    } else {
      // OPTION COUNTS (job 6, trim-fence sweep, Oct 2026): each option's count must come from the
      // SAME pool the range is built from - the today-first window (last twelve months when that
      // clears the range threshold, else the full ladder window) with the universal, non-trim fences
      // applied (provenance / engine swap / model-specific halo), never the raw unfiltered multi-year
      // `rows`. The old count read every one of this model's sales ever archived, regardless of date
      // or provenance - so a dense, long-running model's options summed to far more than the pool a
      // reader was actually looking at (confirmed live: 911 Cabriolet options summed to 34 against a
      // 15-sale headline). Computed independently of the later `window`/`solid` (those are scoped to
      // the base trims only, by design - see the default-scoping block below - so a non-base option
      // like "Carrera 4S" would read zero sales if it had to share that pool).
      const qWinIso = iso(365).slice(0, 10);
      const qRecent = rows.filter(r => String(r.auction_end_date || "").slice(0, 10) >= qWinIso);
      const qUseRecent = r4Split(qRecent, false).solid.length >= 8;
      const qWindow = qUseRecent ? qRecent : rows;
      const qHaloRe = modelHaloReFor(spec.make, spec.model);
      const qClean = r => !isProvenance(r) && !isEngineSwap(r, spec.make, spec.model) && !(qHaloRe && (qHaloRe.test(titleOf(r)) || qHaloRe.test(String(r.rtitle || ""))));
      const groups = fenceGroup.fences.map(f => {
        const matched = qWindow.filter(r => f.include.test(titleOf(r)) && !f.exclude.test(titleOf(r)) && qClean(r));
        const latest = matched.map(r => String(r.auction_end_date || "").slice(0, 10)).filter(Boolean).sort().pop() || null;
        return { f, n: matched.length, latest, prices: matched.map(r => r._usd) };
      }).filter(g => g.n >= SPLIT_MIN);
      // MATERIALITY (Round 4 Job 3): trim already enforced SPLIT_MIN per group above (job 6); this
      // adds the other half of the ONE shared rule - at least two of the qualifying groups must be
      // clearly apart in price (splitMaterial, same predicate as gearbox/competition/body below),
      // not just present with enough sales. Checked on the two largest groups by count (the pair
      // most likely to anchor a real question); if even the biggest two aren't clearly apart,
      // smaller pairs among the same groups would not be either on the modality this engine cares
      // about, so no further pairwise search is needed.
      const topTwo = groups.slice().sort((a, b) => b.n - a.n).slice(0, 2);
      const trimMaterial = topTwo.length === 2 ? splitMaterial(topTwo[0].prices, topTwo[1].prices).material : false;
      if (groups.length >= 2 && trimMaterial) {
        trimQuestion = {
          model: spec.model || spec.make,
          base: fenceGroup.fences.filter(f => f.base).map(f => f.name),
          // poolN (job 6): the universal-fenced, date-windowed pool every option count was drawn from -
          // a crossProductCheck/odd-sale-report invariant can assert sum(options.n) <= poolN (options
          // are disjoint by construction: each fence excludes every other named trim).
          poolN: qWindow.length,
          // thin (job 5/6): below RANGE_THRESHOLD (8), the same bar every other split/over-time row
          // uses - the option still renders (it already cleared SPLIT_MIN=3 via the groups filter
          // above) but is flagged low-confidence rather than silently presented as equally solid.
          options: groups.map(g => ({ value: trimSlug(g.f.name), label: g.f.name, n: g.n, thin: g.n < RANGE_THRESHOLD })),
          // Item 2c: ONLY the non-base trims, for the "Other trims" section - grouped by trim with a
          // count and the latest sale, never tagged Above/Below range (that tag is reserved for a
          // same-trim price outlier within the chosen pool - see "Shown separately" below).
          otherTrims: groups.filter(g => !g.f.base).map(g => ({ value: trimSlug(g.f.name), label: g.f.name, n: g.n, latest: g.latest }))
        };
      }
      // Default scoping (TIGHTENED, trim-fence sweep, Oct 2026): keep ONLY rows matching a BASE trim
      // (Carrera / Carrera S for the 911 - the pair a plain "911" means in ordinary use). The old rule
      // dropped rows matching a named OTHER trim but let an UNMATCHED-trim row "stay - never dropped
      // on a guess" - that let an unrecognized special edition ride into the base pool and its cards/
      // span untouched (confirmed live: a bare 2025 911 Cabriolet search carried a $288,000 "911
      // Spirit 70" - no fence recognizes that title at all, so it matched neither a base nor an other
      // fence and silently stayed - in its 15-card pool against a clean $115k-$134k cluster). Sam's
      // rule: a bare nameplate/body-style search never pools a performance or special trim unless
      // asked, and that must hold for every unnamed trim, not just the ones a fence happens to name.
      // Only applies when the group HAS a base fence (true for the 911 today); a group with none keeps
      // every row, same as before.
      const baseFences = fenceGroup.fences.filter(f => f.base);
      if (baseFences.length) {
        const scoped = rows.filter(r => baseFences.some(f => f.include.test(titleOf(r)) && !f.exclude.test(titleOf(r))));
        // e59: a base scope that would EMPTY the pool is no scope. A 1964 to 1973 911 pool holds no Carrera (its base cars
        // are the 911, 911 T, 911 E and 911 S), so the Carrera / Carrera S default read zero rows and a bare "1973
        // Porsche 911" refused with 261 sales on record. With no base row at all, the pool keeps every row.
        if (scoped.length) rows = scoped; else base.baseScopeEmpty = true;
      }
    }
  }
  // Inline refinement (the earned question answered): narrow by mileage band and/or transmission.
  const refined = !!(refine && (refine.miMin != null || refine.tx || refine.variant || refine.driver || refine.observe || refine.body || refine.trim || refine.docHistory));
  let observeAside = null;
  if (refined) {
    if (refine.miMin != null) {
      const inBand = rows.filter(r => { const m = miOf(r); return m > 0 && m >= refine.miMin && (refine.miMax == null || m < refine.miMax); });
      // MILEAGE NEAREST-SALES FALLBACK (Part 3): a mileage band too thin to stand on its own never
      // dead-ends. Instead of an empty pool, show the real sales NEAREST that mileage - this changes
      // WHICH sales are shown, never a number. The honest flag drives the copy ("the closest sales by
      // mileage"), so it never reads as an exact-band match it isn't.
      // Part 3 item 4: FEWER THAN SPLIT_MIN sales in the given mileage band -> show the SPLIT_MIN
      // NEAREST in mileage, labelled "Nearest in miles". SPLIT_MIN+ in band stand on their own. This
      // changes WHICH sales are shown, never a number. SPLIT_MIN (job 5, thin-pool minimums): the one
      // shared floor for every split (trim, gearbox, mileage) to carry a range at all - same constant
      // inlineSplitRange and the trim question use, not a fourth number for this one split.
      if (inBand.length >= SPLIT_MIN) {
        rows = inBand;
      } else {
        const target = refine.miTarget != null ? refine.miTarget
          : (refine.miMax != null ? Math.round((refine.miMin + refine.miMax) / 2) : refine.miMin);
        const withMi = rows.filter(r => miOf(r) > 0).sort((a, b) => Math.abs(miOf(a) - target) - Math.abs(miOf(b) - target));
        rows = withMi.slice(0, Math.max(SPLIT_MIN, inBand.length));
        base.mileageFallback = { target, n: rows.length, inBand: inBand.length, label: "Nearest in miles" };
      }
    }
    // Gearbox refine (Part 1 Rule 2): classify by title+transmission (F1/PDK/SMG = auto), so a
    // Ferrari F1 or a Porsche PDK is caught even when the transmission field is bare.
    if (refine.tx === "manual") rows = rows.filter(r => gearboxType(r) === "manual");
    if (refine.tx === "auto") rows = rows.filter(r => gearboxType(r) === "auto");
    // Body style refine (Oct 2026, Sam: "ask it, same style as miles"): narrow to the chosen body,
    // read off the title the same way the body QUESTION below detects it - one detector, one answer.
    // (refine.body is applied at the END of this function, on the finished pool, so the page a body option opens
    // keeps the bare page's window and set-asides and its count equals the option's count - e41, Sam's Job 1b.)
    // Competition-variant refine (Part 1 change 1): the askable variant in or out of the range.
    if (refine.variant === "competition") rows = rows.filter(r => r._askable);
    if (refine.variant === "standard") rows = rows.filter(r => !r._askable);
    // Variant-market answer (Job 4): the chip names the variant key or "standard".
    for (const vm of (spec.variantMarkets || [])) {
      if (refine.variant === vm.key) rows = rows.filter(r => vm.re.test(titleOf(r)));
      if (vm.nonKey && refine.variant === vm.nonKey) rows = rows.filter(r => !vm.re.test(titleOf(r)));
      if (!vm.generic && refine.variant === "standard") rows = rows.filter(r => !vm.re.test(titleOf(r)));
    }
    // Documented-history refine (Round 4 Job 3): same desc_facts.markers test the question itself
    // used to split the pool - narrows to whichever side was chosen.
    if (refine.docHistory === "has" || refine.docHistory === "nohas") {
      const hasMarker = r => { const m = r.desc_facts && Array.isArray(r.desc_facts.markers) ? r.desc_facts.markers : []; return m.includes("documented_history") || m.includes("matching_numbers"); };
      rows = rows.filter(r => refine.docHistory === "has" ? hasMarker(r) : !hasMarker(r));
    }
    // Dictionary driver (item 7/8): narrow to the listings that carry (or do not carry) the mined
    // title flag. Framed "listed as" in the copy since it is read off the title, not inspected.
    if (refine.driver) { const drv = driverByKey(base.vehicle, refine.driver); if (drv) rows = rows.filter(r => refine.driverVal === "no" ? !drv.re.test(dtext(r)) : drv.re.test(dtext(r))); }
    // Observable-fact refinement (item 9): hold the flagged cars OUT of the main band and report
    // THEIR own range as an aside. Never adjusts a price; the main band becomes "cars that didn't".
    if (refine.observe && OBSERVE_FLAGS[refine.observe]) {
      const det = OBSERVE_FLAGS[refine.observe];
      const fu = rows.filter(r => det.re.test(obText(r))).map(r => r._usd).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
      if (fu.length) observeAside = { key: refine.observe, label: det.label, lo: roundFloor(fu[0]), hi: roundCeil(fu[fu.length - 1]), n: fu.length };
      rows = rows.filter(r => !det.re.test(obText(r)));
    }
  }
  rows.sort((a, b2) => String(b2.auction_end_date || "").localeCompare(String(a.auction_end_date || "")));
  // An exact-trim pool IS the special (GT3 RS / Z06 / Shelby / M4 Competition), so the collector
  // set-aside must not fire on it - the whole pool would vanish. Family/base pools set halos aside.
  const exactStep = chosen.step === "exact_trim" || chosen.step === "exact_trim_wide" || chosen.step === "exact_trim_keyword";
  const keepAll = exactStep;

  // THE WINDOW RULE (Sam, Oct 18 2026, e60): the SHORTEST window that reaches eight solid sales, the last twelve
  // months, then 24, then 36, then the ladder's own window (five years). Measured before the change on 94 specs: 20
  // answers move from five years to two or three, none loses or gains a range, no rung changes, midpoints move a
  // median 3 percent, and the answers that lean on a sale older than three years halve (31 to 16).
  const winIso = iso(365).slice(0, 10), win2 = iso(730).slice(0, 10), win3 = iso(1095).slice(0, 10);
  const recent = rows.filter(r => String(r.auction_end_date || "").slice(0, 10) >= winIso);
  const prior = rows.filter(r => { const d = String(r.auction_end_date || "").slice(0, 10); return d < winIso && d >= win2; });
  const within = cut => rows.filter(r => String(r.auction_end_date || "").slice(0, 10) >= cut);
  const solidN = rs => r4Split(rs, keepAll).solid.length;
  let windowMonthsChosen = null, window = rows;
  if (solidN(recent) >= 8) { windowMonthsChosen = 12; window = recent; }
  else if (solidN(within(win2)) >= 8) { windowMonthsChosen = 24; window = within(win2); }
  else if (solidN(within(win3)) >= 8) { windowMonthsChosen = 36; window = within(win3); }
  const useRecent = windowMonthsChosen === 12;
  const windowLabel = windowMonthsChosen === 12 ? "last twelve months" : windowMonthsChosen === 24 ? "last two years" : windowMonthsChosen === 36 ? "last three years" : chosen.windowLabel;
  const b = { ...base, windowLabel, windowMonthsChosen };
  // APPLIED CHOICE ON resolvedCar (e43, Sam's Job 2, moved here from the result return so a refused or thin refined
  // page carries it too): the body or trim a refine applied is written onto the car the engine returns.
  if (refine && (refine.body || (refine.trim && chosenTrimName))) {
    const rc = base.resolvedCar || {};
    b.resolvedCar = { ...rc, bodyStyle: (refine.body && refine.body !== "unspecified") ? refine.body : (rc.bodyStyle || null), trim: (refine.trim && chosenTrimName) ? chosenTrimName : (rc.trim || null), applied: { body: refine.body || null, trim: (refine.trim && chosenTrimName) ? chosenTrimName : null } };
  }
  // Fix 5: for a COVERED model the Rule 5 guard has already removed wrong cars and year-gated the
  // pool, so every remaining non-tagged sale is a real same-model car and belongs IN the range -
  // a price/mileage outlier is NOT a variant. Aside = only the guard-tagged variants (r._tag);
  // everything else is solid. Uncovered models keep the r4Split price fence (no guard to trust).
  let solid, aside;
  if (mrRulesFor(spec.make, spec.model)) {
    aside = window.filter(r => r._tag);
    solid = window.filter(r => !r._tag);
  } else {
    ({ solid, aside } = r4Split(window, keepAll));
  }
  // PROVENANCE SET-ASIDE (Part 3 bug 3): pull ex-celebrity / works / press / show cars OUT of the
  // solid pool on EVERY path, so they never sit in the typical range or the side cards. Tagged so the
  // "Shown separately" group can carry them; their value traces to provenance, not the market.
  const prov = solid.filter(isProvenance);
  if (prov.length) { prov.forEach(r => { if (!r._tag) r._tag = "provenance"; }); solid = solid.filter(r => !isProvenance(r)); aside = aside.concat(prov); }
  // MODIFIED / ENGINE SWAP (set aside like a restomod): a non-factory engine, a modified/widebody/
  // bagged/lifted car, a named tuner build (RUF, a slant-nose conversion) or a cosmetic non-factory
  // conversion never sits in the range or side cards. ONE shared list (lib/modelRules.js
  // RESTOMOD_TAGS via restomodReason), the same one Sell's house-receipt and thin-pool reads already
  // use, instead of the narrower local ENGINE_SWAP_RE this replaces (comparable-fences job, Oct 2026).
  // Covers uncovered models (r4Split); covered models are already tagged by rule5PoolGuard.
  const swapped = solid.filter(r => isEngineSwap(r, spec.make, spec.model));
  if (swapped.length) { swapped.forEach(r => { if (!r._tag) r._tag = isEngineSwap(r, spec.make, spec.model); }); solid = solid.filter(r => !isEngineSwap(r, spec.make, spec.model)); aside = aside.concat(swapped); }
  // MODEL-SPECIFIC HALOS (bug 6): set aside alloy-body / race 300SLs so the steel Gullwing pool reads
  // as one market instead of "too spread out". Make+model scoped; never fires for other cars.
  const mhRe = modelHaloReFor(spec.make, spec.model);
  if (mhRe) { const mh = solid.filter(r => mhRe.test(titleOf(r)) || mhRe.test(String(r.rtitle || ""))); if (mh.length) { mh.forEach(r => { if (!r._tag) r._tag = "halo"; }); solid = solid.filter(r => !(mhRe.test(titleOf(r)) || mhRe.test(String(r.rtitle || "")))); aside = aside.concat(mh); } }
  // MAKE-LEVEL HALO (job 2e, trim-fence sweep, Oct 2026): a named homologation/limited special above
  // the base model (BMW M3/M4 CSL, CS, Sport Evolution, GT/GTR; Corvette Z06/ZR1; Shelby GT350/GT500;
  // Mercedes AMG; ...) via the SAME shared rule every other surface uses (recordExcludeReason /
  // HALO_PATTERNS), so a dense base-model pool can never mix in a halo sold at a different market.
  // Confirmed live: a 2005 BMW M3 Coupe's 87-sale pool had no fence at all for a CSL/GTR special (BMW
  // has no SUBTRIM_FENCES entry, unlike the 911). Skipped when fenceGroup already ran its own,
  // trim-precise base-set scoping (the 911's Carrera/Carrera S default) - that mechanism is already
  // the more precise one and this would be redundant there. self carries the query's own model+trim,
  // so a query that NAMES the halo (a CSL search) keeps it (rule 16).
  // BADGE-AWARE (URGENT, Oct 2026, SL-Class class-era leak root cause #4): this is the SAME
  // unconditional make-halo call assessThin/the house pool already guard with intrinsicAmgFor -
  // this one, in buildPool's solid-pool assembly, had no such guard at all, so it alone still
  // excluded every R232 SL sale as a "halo" even after the other four sites were fixed (solid
  // dropped to 0, tripping the solid.length<THIN refusal branch even though refusalRows/cards
  // correctly held 23 real sales). intrinsicAmgFor(..., spec.year) skips the generic AMG halo
  // for a badge/intrinsic-AMG car, same as the other sites; wantHalo stays false either way.
  if (!fenceGroup && !intrinsicAmgFor(spec.make, spec.model, spec.year)) {
    const halo = solid.filter(r => recordExcludeReason(r, spec.make, { wantHalo: false, self: `${spec.model || ""} ${spec.trim || ""}` }));
    if (halo.length) { halo.forEach(r => { if (!r._tag) r._tag = "halo"; }); solid = solid.filter(r => !halo.includes(r)); aside = aside.concat(halo); }
  }
  const refusalRows = rows.filter(r => !isEngineSwap(r, spec.make, spec.model) && !isProvenance(r));
  const THIN = 3;
  const isCoveredModel = !!mrRulesFor(spec.make, spec.model);
  // BODY REFINE ON THE FINISHED POOL (e41, Sam's Job 1b): the chosen body narrows the SAME rows, window and
  // set-asides the bare page used - one classifier (classifyBody: the title's word, else a stored body the
  // model's own facts offer), the same one the options are counted with, so "Coupe (19)" opens a page of 19.
  if (refine && refine.body) {
    // "unspecified" (e53): the sales whose titles name no body, their own option, never a silent gap.
    const bodyRule = mrRulesFor(spec.make, spec.model);
    const rowBodyOf = r => rowBodyWordOf(r, bodyRule);
    // e66 (the 1989 Miata Roadster after-read, Sam's approved lock rule extended by Lane F): when the generation was built in ONE
    // body (modelRules; the generation from the code, else from the year) and the chosen body is that body, a title that names
    // no body IS that body and stays ("1990 Mazda MX-5 Miata" on a Roadster page). A title naming another body is still out.
    const onlyGen = bodyRule ? (spec.genCode || (spec.year ? ((bodyRule.generations || []).find(g => Array.isArray(g.years) && spec.year >= g.years[0] && spec.year <= g.years[1]) || {}).code : null)) : null;
    const onlyBodies = onlyGen ? mrBodiesForGen(bodyRule, onlyGen) : null;
    const lockedBody = refine.body !== "unspecified" && onlyBodies && onlyBodies.length === 1 && bodyFamily(onlyBodies[0]) === bodyFamily(refine.body);
    const keep = refine.body === "unspecified" ? (r => !rowBodyOf(r)) : (r => { const b = rowBodyOf(r); if (!b) return !!lockedBody; return bodyFamily(b) === bodyFamily(refine.body); });   // one classifier, title words only, compared by family
    // e54: a body page's receipts are ITS rows. The refusal path shows refusalRows (every window row but engine swaps
    // and provenance, modified cars included); on "Body not stated (1)" for the 1969 Camaro that showed 31 cards. A
    // body page refuses on its own solid rows and sets aside the rest of its rows with reasons, so the page opens
    // exactly the option's count.
    const solidKept = solid.filter(keep);
    return { b, rows: rows.filter(keep), trimQuestion, chosenTrimName, refined, observeAside, keepAll, exactStep, winIso, win2, recent: recent.filter(keep), prior: prior.filter(keep), useRecent, windowLabel, window: window.filter(keep), solid: solidKept, aside: aside.filter(keep), refusalRows: solidKept, THIN, isCoveredModel, fenceGroup };
    // (the former return, kept for the record of what changed)
    // eslint-disable-next-line no-unreachable
    return { b, rows, trimQuestion, chosenTrimName, refined, observeAside, keepAll, exactStep, winIso, win2, recent: recent.filter(keep), prior: prior.filter(keep), useRecent, windowLabel, window: window.filter(keep), solid: solid.filter(keep), aside: aside.filter(keep), refusalRows: refusalRows.filter(keep), THIN, isCoveredModel, fenceGroup };
  }
  return { b, rows, trimQuestion, chosenTrimName, refined, observeAside, keepAll, exactStep, winIso, win2, recent, prior, useRecent, windowLabel, window, solid, aside, refusalRows, THIN, isCoveredModel, fenceGroup };
}

// ---- Part 5/6 Market Check design fields (Lane B job, Oct 2026; corrected by Sam the same day) ----
// Every field below is computed from the SAME pool (solid) the range/cluster itself is built from,
// never a separate query, never a different fence. heroReceipt was explicitly dropped per Sam's
// correction ("the final page has no hero receipt" - never built, never returned).

// contextRoles: three sales chosen to EXPLAIN the market, not for symmetry. Range/band tier (a
// cluster exists): near the middle of the typical range, at its lower edge, at its upper edge -
// the closest real sale to each point, ties broken by most recent. Thin tier (no cluster): the
// lowest sale on record, the highest, and one between (closest to the pool's own median). A pool
// too small to name three DISTINCT sales still returns the roles it can, never inventing a fourth.
function contextRolesFor(solid, cluster, widened) {
  if (!solid || solid.length < 1) return null;
  const priced = solid.filter(r => Number.isFinite(r._usd));
  if (!priced.length) return null;
  const byPrice = priced.slice().sort((a, b) => a._usd - b._usd);
  const pick = target => byPrice.slice().sort((a, b) => Math.abs(a._usd - target) - Math.abs(b._usd - target) || String(b.auction_end_date || "").localeCompare(String(a.auction_end_date || "")))[0];
  let roles;
  if (cluster) {
    const mid = (cluster[0] + cluster[1]) / 2;
    roles = [
      { role: "near the middle of the typical range", sale: pick(mid) },
      { role: "at the lower edge of the typical range", sale: pick(cluster[0]) },
      { role: "at the upper edge of the typical range", sale: pick(cluster[1]) }
    ];
  } else {
    const lo = byPrice[0], hi = byPrice[byPrice.length - 1];
    const med = percentile(byPrice.map(r => r._usd), 0.5);
    roles = [
      { role: "the lowest sale on record", sale: lo },
      { role: "the highest sale on record", sale: hi },
      { role: "a sale between the two", sale: pick(med) }
    ];
  }
  const seen = new Set(), out = [];
  for (const r of roles) {
    const key = r.sale && r.sale.id != null ? r.sale.id : r.sale;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ role: r.role, sale: shapeCards([r.sale])[0] });
  }
  const sentence = cluster
    ? (widened ? "These three sales were chosen to show the typical range after widening the years, not for symmetry." : "These three sales were chosen to show where the typical range sits, not for symmetry.")
    : "These three sales were chosen because the pool is too thin to mark a typical range, not for symmetry.";
  return { roles: out, sentence };
}

// identityQuestion: returned BEFORE any range when body or trim materially changes it and EVERY
// alternative clears RANGE_THRESHOLD - an option under that never renders. Trim is tried first
// (trimQuestion already proves materiality via splitMaterial, lib/onebox.js); body is gated on
// count alone here (a documented simplification - trimQuestion's own materiality recompute is not
// duplicated for body in this pass).
function identityQuestionForAnswer(trimQuestion, bodyOptions, bodyUnspecified) {
  if (trimQuestion && Array.isArray(trimQuestion.options)) {
    const qualifying = trimQuestion.options.filter(o => o.n >= RANGE_THRESHOLD);
    if (qualifying.length >= 2) return { dimension: "trim", prompt: "Which trim is it?", options: qualifying.map(o => ({ label: o.label, n: o.n })) };
  }
  // Body (e41, Sam's Job 1c): every body present with at least one sale is an option, with the count of the page
  // it opens; unspecified is the rows no body word names (in "Any", in no option); total is the pool.
  if (Array.isArray(bodyOptions) && bodyOptions.length >= 2) {
    // e53: "Body not stated" is one of the options, so the options sum to the pool and nothing is unspecified.
    const covered = bodyOptions.some(o => o.value === "unspecified");
    const total = bodyOptions.reduce((s, o) => s + (o.inPool || 0), 0) + (covered ? 0 : (bodyUnspecified || 0));
    return { dimension: "body", prompt: "Which body style is it?", options: bodyOptions.map(o => ({ label: o.label, n: o.n, value: o.value })), unspecified: covered ? 0 : (bodyUnspecified || 0), total };
  }
  return null;
}

// trend: REAL calendar quarters over the same pool (solid), each {period, low, high, typical, count} -
// returned only when 3+ quarters each clear RANGE_THRESHOLD; no partial trend otherwise (the whole
// field is absent). priorYear: the middle half of the SAME window one year earlier (the engine's own
// prior-year rows, already fenced the identical way recent/prior feed yearOverYearDirectionFor),
// present only when that window itself clears RANGE_THRESHOLD.
function trendFor(solid, priorSolid) {
  const byQ = new Map();
  for (const r of solid) {
    const d = String(r.auction_end_date || "").slice(0, 10);
    if (!d || !Number.isFinite(r._usd)) continue;
    const y = d.slice(0, 4), q = Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1;
    const key = `${y}-Q${q}`;
    if (!byQ.has(key)) byQ.set(key, []);
    byQ.get(key).push(r);
  }
  // THE LAST FOUR CALENDAR QUARTERS, ALWAYS (Sam, Oct 14 2026): the quarter today sits in and the three
  // before it, each with its own figures from that quarter's sales in the pool; a quarter under
  // RANGE_THRESHOLD still returns its figures (nulls when it has no sale) flagged thin: true - the chart
  // is the one place a thin quarter shows. The trend exists only when at least one of the four has eight
  // or more sales; otherwise the field is absent, as before.
  const now = new Date(obNow());
  const last4 = [];
  for (let k = 3; k >= 0; k--) {
    const m = now.getUTCMonth() - 3 * k, y = now.getUTCFullYear() + Math.floor(m / 12), q = Math.floor((((m % 12) + 12) % 12) / 3) + 1;
    last4.push(`${y}-Q${q}`);
  }
  if (!last4.some(key => (byQ.get(key) || []).length >= RANGE_THRESHOLD)) return null;
  const quarterRows = last4.map(period => {
    const rows = byQ.get(period) || [];
    const band = rows.length ? r4Cluster(rows) : [null, null];
    return { period, low: band[0], high: band[1], typical: rows.length ? Math.round(percentile(rows.map(r => r._usd), 0.5)) : null, count: rows.length, thin: rows.length < RANGE_THRESHOLD };
  });
  let priorYear = null;
  const priorPriced = (priorSolid || []).filter(r => Number.isFinite(r._usd));
  if (priorPriced.length >= RANGE_THRESHOLD) {
    const band = r4Cluster(priorPriced);
    priorYear = { low: band[0], high: band[1] };
  }
  return { quarters: quarterRows, priorYear };
}

// distribution: price buckets from the SAME pool (solid), only when the pool has 20+ sales. Width
// chosen (a "nice" 1/2/5x10^n step) to land 5 to 8 bars; counts, never percentages. The bucket
// holding the pool's own typical (median) sale is marked.
function niceBucketWidth(raw) {
  if (!(raw > 0)) return 1000;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}
function distributionFor(solid) {
  const priced = (solid || []).filter(r => Number.isFinite(r._usd));
  if (priced.length < 20) return null;
  const prices = priced.map(r => r._usd).sort((a, b) => a - b);
  const lo = prices[0], hi = prices[prices.length - 1];
  if (!(hi > lo)) return null;
  const typical = percentile(prices, 0.5);
  const width = niceBucketWidth((hi - lo) / 6);
  const start = Math.floor(lo / width) * width;
  const bars = Math.max(5, Math.min(8, Math.ceil((hi - start) / width) || 1));
  const buckets = [];
  for (let i = 0; i < bars; i++) {
    const bLo = start + i * width, bHi = i === bars - 1 ? Math.max(hi, start + (i + 1) * width) : start + (i + 1) * width;
    const rows = priced.filter(r => r._usd >= bLo && (i === bars - 1 ? r._usd <= bHi : r._usd < bHi));
    buckets.push({ low: Math.round(bLo), high: Math.round(bHi), count: rows.length, receipts: shapeCards(rows), typicalBucket: typical >= bLo && (i === bars - 1 ? typical <= bHi : typical < bHi) });
  }
  // share (Sam, Oct 14 2026): each bucket's count over the pool count as a whole percent, largest-
  // remainder rounding so the shares sum to exactly 100. The page prints "36% (15)".
  const total = buckets.reduce((s, b) => s + b.count, 0) || 1;
  const exact = buckets.map(b => b.count * 100 / total);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((s, v) => s + v, 0);
  const order = exact.map((v, i) => [v - floors[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) { if (left <= 0) break; floors[i]++; left--; }
  buckets.forEach((b, i) => { b.share = floors[i]; });
  return { buckets, typical: Math.round(typical) };
}

// strip: every sale in the pool, flat, newest first (the same order recent3/cards already use) - for
// when trend has fewer than 3 qualifying quarters. Exactly the receipts behind poolSize: same count,
// same pool, no second read. The middle-half low/high are already on the main answer (cluster/span);
// this never repeats them.
// ownSales (Lane B job, Oct 13 2026, Job 5, FOR LANE A's "This car's own sales"): for a VIN or chassis
// search, the exact car's own sales from the SAME receipts and fences as the answer - every card in the
// pool (and any the fences set aside, marked) whose vin_norm is the searched identity. Newest first;
// lastSale is the first of them with where its price sits against the typical range (placingFor, the one
// shared placing rule: "inside the range" / "above the range" / "below the range", null with no band).
// null when nothing was searched by identity or no receipt is this car. Only rows inside the pool's own
// window appear (same records, nothing separate); an older sale of the car is on its history page.
function ownSalesFor(vehicle, cards, asideCards, cluster) {
  const exactId = vehicle && (vehicle.vin || vehicle.chassis) ? String(vehicle.vin || vehicle.chassis).toUpperCase().replace(/[^A-Z0-9]/g, "") : null;
  if (!exactId) return null;
  const norm = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const own = [...(cards || []).map(c => ({ c, setAside: false })), ...(asideCards || []).map(c => ({ c, setAside: true }))]
    .filter(x => x.c && x.c.vinNorm && norm(x.c.vinNorm) === exactId)
    .sort((a, b) => String(b.c.date || "").localeCompare(String(a.c.date || "")))
    .map(x => ({ id: x.c.id != null ? x.c.id : null, date: x.c.date || null, price: Number.isFinite(x.c.price) ? Math.round(x.c.price) : null, venue: x.c.platform || null, miles: x.c.mi || null, url: x.c.url || null, title: x.c.title || null, setAside: x.setAside }));
  if (!own.length) return null;
  const band = Array.isArray(cluster) && cluster.length === 2 ? cluster : null;
  return { sales: own, lastSale: { ...own[0], placing: band && own[0].price != null ? placingFor(own[0].price, band) : null } };
}

// windowFacts (Sam, Oct 14 2026, every tier): the window the pool actually used, as a number of months, an
// ISO start date and plain words built from them - "in the last twelve months" when the engine read the
// rolling year, otherwise "since {Month YYYY}" from the earliest sale in the pool. No fallback wording
// anywhere downstream: a consumer with no words prints no window clause (lib/live/search.js marketWin).
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function windowFactsFor(rows, useRecent) {
  const start = (rows || []).map(r => String(r.auction_end_date || "").slice(0, 10)).filter(Boolean).sort()[0] || null;
  // e60 (Sam): one form on every product, "since {Month Year}" from the oldest included sale; no month count anywhere.
  if (!start) return { windowMonths: useRecent ? 12 : null, windowStart: null, windowWords: null };
  const t = Date.parse(start + "T00:00:00Z");
  const months = Number.isFinite(t) ? Math.max(1, Math.ceil((obNow() - t) / (30.4 * 864e5))) : null;
  const m = /^(\d{4})-(\d{2})/.exec(start);
  return { windowMonths: months, windowStart: start, windowWords: m ? `since ${MONTH_FULL[Number(m[2]) - 1]} ${m[1]}` : null };
}

// variantSuffix (e40): the scope line names which variant the range is when the nameplate has a variant
// market: ", pushrod cars" on its own, ", pushrod cars (2 Carrera four-cam set aside)" when some were set
// aside, ", Touring and Lightweight cars mixed" when both sides are eight or more on a thin pool.
// variantSuffixAll (e47): the nameplate's own variant suffix, then a generic (restoration) set-aside suffix.
function variantSuffixAll(result) {
  const list = Array.isArray(result.variantAsides) ? result.variantAsides : (result.variantAside ? [result.variantAside] : []);
  return list.map(va => va.generic ? (va.n ? `, ${va.base} cars (${va.n} ${va.label} set aside)` : "") : variantSuffix(va)).join("");
}
function variantSuffix(va) {
  if (!va || !va.base) return "";
  if (va.mixed) return `, ${va.base} and ${va.label} cars mixed`;
  return va.n ? `, ${va.base} cars (${va.n} ${va.label} set aside)` : `, ${va.base} cars`;
}
// refusalSetAside (item 10, e47): on a refused pool the rows held out of the receipts are the engine swaps and
// provenance cars (refusalRows is every other fenced row), each with its reason words, flagged setAside.
function refusalSetAside(rows, refusalRows, spec) {
  const out = (rows || []).filter(r => !refusalRows.includes(r));
  const reason = r => isEngineSwap(r, spec.make, spec.model) ? "modified" : "odd sale";
  const setAsideRows = shapeCards(out).map((c, i) => ({ ...c, reason: reason(out[i]), setAside: true }));
  return { setAsideRows, setAsideCount: setAsideRows.length, qualifyingTotal: refusalRows.length + setAsideRows.length };
}
function stripFor(solid) {
  const priced = (solid || []).filter(r => Number.isFinite(r._usd));
  if (!priced.length) return null;
  const sorted = priced.slice().sort((a, b) => String(b.auction_end_date || "").localeCompare(String(a.auction_end_date || "")));
  const sales = sorted.map(r => ({ date: r.auction_end_date || null, price: Math.round(r._usd), miles: miOf(r) || null, venue: platNamed(r.source), id: r.id != null ? r.id : null }));
  return { sales, latestSale: sales[0] || null };
}

export function buildResult(chosen, base, iso, spec, refine) {
  const pool = buildPool(chosen, base, iso, spec, refine);
  if (base && base.dedup && Array.isArray(base.dedup.marks)) base.dedup.marks.push(["pool_built", Date.now() - base.dedup.t0]);   // stage mark, diagnostics only
  const { b, rows, trimQuestion, chosenTrimName, refined, observeAside, keepAll, exactStep, winIso, recent, prior, useRecent, windowLabel, window, THIN, isCoveredModel } = pool;
  let { solid, aside } = pool;
  const { refusalRows } = pool;
  // RANGE LADDER floor (Part 3): 3+ qualified sales render the thin "here are the sales" state (no
  // range); 1-2 fall to the single-sale / thin-mode return below; 0 is the not-tracked return. The
  // old floor was 4, which sent a 3-sale pool to refusal - the ladder now keeps it as an honest thin
  // result listing the three sales. THIN/refusalRows/isCoveredModel now come from buildPool above -
  // the same values the gearbox/competition question block (runOneBoxCore) reads, never a second copy.
  if (chosen.step === "thin" || solid.length < THIN) {
    return { ...b, tier: "refusal", ladderStep: "thin", thinReason: thinReasonFor(null, refusalRows.length), thinLine: THIN_LINES[thinReasonFor(null, refusalRows.length)], refusal: { kind: "thin", model: spec.subject }, cards: shapeCards(refusalRows), rawPool: refusalRows, ...refusalSetAside(rows, refusalRows, spec), recent3: lastThreeDistinct(shapeCards(refusalRows)), referenceFigure: null, referenceFigureReason: "too few qualifying sales for any range, so there is no typical band to build a figure from", ...windowFactsFor(refusalRows, false) };
  }
  const su = solid.map(r => r._usd);
  const ratio = solid.length >= 6 ? percentile(su, 0.9) / Math.max(1, percentile(su, 0.1)) : (su.length ? Math.max(...su) / Math.max(1, Math.min(...su)) : 1);
  const yrs = solid.map(r => Number(r.year)).filter(Boolean), yspan = yrs.length ? Math.max(...yrs) - Math.min(...yrs) : 0;
  // Varied refusal: genuinely different markets pooled under one name. chosen.forceVaried is the
  // base (no-trim) arm of the #2 fence - a bare blend-nameplate ("250 GT") whose one token names
  // distinct models must NEVER render a computed span or cluster, even when a body-scoped subset
  // happens to look low-ratio. It routes here (varied), exactly as the trim-path fence routes a
  // thin trim pool to span-without-cluster instead of widening into the family.
  if (chosen.forceVaried || (!refined && (ratio > 6 || (yspan >= 15 && variantTokens(solid).length >= 2 && ratio > 2.5)))) {
    const yearSpanPhrase = yspan >= 20 ? "more than twenty years" : yspan >= 10 ? "more than a decade" : yspan >= 2 ? `${yspan} years` : null;
    return { ...b, tier: "refusal", ladderStep: "varied", samLine: "Sales too spread out for a range.", refusal: { kind: "varied", model: spec.subject, variants: variantTokens(refusalRows).slice(0, 6), yearSpanPhrase }, cards: shapeCards(refusalRows), rawPool: refusalRows, ...refusalSetAside(rows, refusalRows, spec), recent3: lastThreeDistinct(shapeCards(refusalRows)), referenceFigure: null, referenceFigureReason: "the qualifying sales span different markets pooled under one name, too varied for a single band", ...windowFactsFor(refusalRows, useRecent) };
  }
  // RANGE LADDER bucket (Part 3), by qualified pool size: 16+ cluster, 8-15 band, 3-7 thin.
  // For the thin band, ALL the sales are shown (the state lists them), and `olderOutside` reports how
  // many of them predate the recent twelve-month window, with the years - the raw material for the
  // "14 more sold in 2023 and 2024" count line. The pool is NOT re-scoped here (every sale stays
  // visible in the cards); the recent-window split is a render decision the surface makes from this
  // field. Only emitted for the thin tier, where it is meaningful.
  const rangeTier = rangeTierForCount(solid.length);
  let olderOutside = null;
  if (rangeTier === "thin" && !refined) {
    const older = solid.filter(r => String(r.auction_end_date || "").slice(0, 10) < winIso);
    const inWin = solid.length - older.length;
    if (older.length && inWin >= 1) {
      const yrs = [...new Set(older.map(r => Number(String(r.auction_end_date || "").slice(0, 4))).filter(Boolean))].sort((x, y) => x - y);
      olderOutside = { n: older.length, years: yrs, recentN: inWin };
    }
  }
  const span = r4Span(solid);
  const cluster = solid.length >= 8 ? r4Cluster(solid) : null;
  // NAMED RECONCILIATION COUNTS (Oct 2026, count reconciliation job): the exact chain from every
  // qualifying sale in this window down to the sales the range is built from, as PLAIN NUMBERS
  // (never word-ified like soldCount/setAsideCount above) so a product can do real arithmetic with
  // them instead of recomputing its own. Additive only - does not change which sales are IN the
  // range or cards, purely names counts already computed above.
  //   qualifying: window.length - every sale that qualified (fences + trust rules), in this window,
  //     BEFORE the statistical set-aside step. qualifying = used + setAside.total, always.
  //   used: solid.length - the sales the range (cluster/span) is actually built from. The count a
  //     page states as "comparable sales" must always equal this, never qualifying or window.
  //   setAside: aside.length, broken into aboveRange/belowRange/reasons. aboveRange/belowRange are
  //     scoped to cluster (when one exists) - a set-aside row's OWN price compared to the SAME
  //     typical band the range states, exactly how the "Shown separately" cards are labelled
  //     Above/Below today. Rows set aside for a reason OTHER than price (project/replica/modified)
  //     can still land inside the band; those count in neither bucket, only in `reasons`.
  const asideAboveRange = cluster ? aside.filter(r => r._usd > cluster[1]).length : 0;
  const asideBelowRange = cluster ? aside.filter(r => r._usd < cluster[0]).length : 0;
  const counts = {
    qualifying: window.length, used: solid.length,
    setAside: { total: aside.length, aboveRange: asideAboveRange, belowRange: asideBelowRange, reasons: null }
  };
  // bodyScoped (Oct 2026, body-style scoping job; docs/lane-notes.md): true when this car/listing
  // names a body style (Targa, cabriolet, coupe, ...) AND the pool was restricted to it; false when
  // a body style is known but the pool was NOT restricted (spec.familyInclude - a title-split family
  // like the 812 or the Cobra decides membership by variant, so the body filter is deliberately
  // skipped, per qualifyReason's own comment); null when no body style applies (a bare, year-less
  // search, or a model this archive never usefully splits by body). The actual EXCLUSION already
  // happened upstream, at fetch time (qualifyReason's own body check) - this just NAMES whether it
  // did, so Buy/Tasks (lib/live/search.js coreOf/listingMarket, already wired to read this) and task
  // emails (lib/tasks/tasks.js, already gated on it) never silently judge a car against a body-blind
  // range when a body style was actually known.
  // Targa/Speedster body hint (body-style scoping job, follow-up): lib/vehicle.js deliberately
  // keeps a BARE "911 Targa"/"911 Speedster" query's body word in spec.trim, not spec.bodyStyle
  // (PORSCHE_911_BODY_HINT_TRIMS - a pre-existing, documented choice, unrelated to this round's
  // fix, left unchanged). The pool IS genuinely restricted by it (qualifyReason's titleContains
  // check on the trim text) - bodyScoped must say so rather than reading null for a car whose body
  // is both known AND applied, just carried in a different field.
  const trimIsBodyHint = /^(targa|speedster)\b/i.test(String(spec.trim || "").trim());
  const bodyScoped = (!spec.bodyStyle && !trimIsBodyHint) ? null : (spec.familyInclude ? false : true);
  const divergence = computeDivergence(base.exactSale, cluster, solid, winIso);
  const direction = (!refined && useRecent) ? r4Direction(recent, prior, keepAll) : null;
  const driver = r4Driver(solid);
  const platforms = foldPlatforms(solid).map(p => p[0]);          // NAMES only, no counts
  const named = platforms.filter(n => n !== "others");
  const poolYrs = solid.map(r => Number(r.year)).filter(Boolean);

  // The earned question (item 7): DATA-PICKED. On a tight band, mileage as before (transmission
  // outranks it only when its median-price gap is larger). On a WIDE band (> 40% of median), the
  // driver search picks the fact that tightens the band most among mileage / gearbox / dictionary
  // title-flags (5+ on each side); if nothing clears, no question renders and one honest sentence
  // is added. Never asks a field the input already gave, never forces a dictionary question that
  // does not split, and models with no dictionary entry simply fall through to mileage/gearbox.
  let earned = null, driverSentence = null;
  const txGiven = !!(base.vehicle && base.vehicle.transmission);
  const buckets = r4Buckets(solid);
  const txGate = r4Transmission(solid, spec.make);
  const mileageGap = r4MileageGap(solid);
  const mileageOK = !(refined && refine.miMin != null) && !(Number(base.subjectMileage) > 0) && buckets && buckets.length >= 2;
  const txOK = !txGiven && !(refined && refine.tx) && txGate;
  // BODY STYLE QUESTION (Oct 2026, Sam: "Sam asks miles and gearbox but never coupe, cabriolet or
  // targa"): independent of the earned mileage/transmission/driver slot above, so a seller can answer
  // body AND miles, either order. Offered only when the matched pool itself (solid, same basis as the
  // mileage buckets) carries 2+ DETECTED body styles - never when the query's own vehicle already
  // pins one (spec.bodyStyle scopes the fetch itself, so solid would already read single-body) and
  // never once refine.body has answered it. Each offered value needs 2+ real sales so one mistitled
  // listing can never manufacture a split.
  // BODY OPTIONS (rewritten e41, Sam's Job 1): every body present in the pool with at least one sale is offered
  // (so the options plus the unspecified rows sum to the pool), read with the one classifier (classifyBody), and
  // each option's count is the poolSize of the page that option opens, computed by running buildPool with that
  // body refine on the same rows, window and fences (never a second tally). bodyUnspecified counts the rows no
  // title or offered stored body names; they are in "Any" and in no option.
  let bodyOptions = null, bodyUnspecified = 0;
  if (!spec.bodyStyle && !(refined && refine.body)) {
    // TITLE WORDS ONLY (e42): an option is a body the listings themselves name. The stored body_style field never
    // offers one - on the live proof the 2006 BMW M5 offered "Convertible (5)" from Cars & Bids stored fields on a
    // car never built as a convertible. Rows with no body word are unspecified (in "Any", in no option).
    const bodyCounts = new Map();
    for (const r of solid) { const bv = titleBodyOf(r); if (bv) bodyCounts.set(bv, (bodyCounts.get(bv) || 0) + 1); else bodyUnspecified++; }
    // e60: one option per body FAMILY (the chip opens its rows by family since e58), labelled with the family's most
    // frequent title word; counts add up to the family's rows, so each option opens exactly its own count.
    const famCounts = new Map();
    for (const [value, n] of bodyCounts.entries()) {
      const fam = bodyFamily(value);
      const cur = famCounts.get(fam) || { value, inPool: 0, top: 0 };
      cur.inPool += n; if (n > cur.top) { cur.top = n; cur.value = value; }
      famCounts.set(fam, cur);
    }
    if (famCounts.size >= 2 || (famCounts.size >= 1 && bodyUnspecified > 0 && bodyCounts.size >= 2)) {
      bodyOptions = [...famCounts.values()].sort((x, y) => y.inPool - x.inPool).map(({ value, inPool }) => {
        let opened = inPool;
        try { opened = buildPool(chosen, base, iso, spec, { ...(refine || {}), body: value }).solid.length; } catch (e) { opened = inPool; }
        return { value, label: BODY_LABEL[value] || value, n: opened, inPool };
      });
      // BODY NOT STATED (e53, Sam's table run): the sales whose titles name no body are their OWN option, with the
      // count of the page it opens, so the options always sum to Any; never a silent gap (the 1965 Mustang read
      // Convertible 33, Coupe 20, Fastback 12 against 69, four sales in no option).
      if (bodyUnspecified > 0) {
        let opened = bodyUnspecified;
        try { opened = buildPool(chosen, base, iso, spec, { ...(refine || {}), body: "unspecified" }).solid.length; } catch (e) { opened = bodyUnspecified; }
        bodyOptions.push({ value: "unspecified", label: "Body not stated", n: opened, inPool: bodyUnspecified });
      }
    }
  }
  const pickMileageOrTx = () => {
    if (txOK && txGate.gap != null && (mileageGap == null || txGate.gap > mileageGap)) return { kind: "transmission", labels: txGate };
    if (mileageOK) return { kind: "mileage", buckets };
    if (txOK) return { kind: "transmission", labels: txGate };
    return null;
  };
  const ds = r4DriverSearch(solid, cluster, base.vehicle);
  // Selection (items 7+8 reconciled): on a WIDE band, a curated dictionary flag that genuinely
  // splits the pool 5+/5+ is PREFERRED as the second question - it is a model-specific price-mover,
  // more informative than generic mileage/gearbox (item 8: "only asks a dictionary question when the
  // pool splits on it 5+/5+"). Band-tightening orders MULTIPLE qualifying dictionary flags. When no
  // dictionary flag qualifies, fall to the most-tightening of mileage/gearbox (item 7). A tight band
  // asks mileage as before. Nothing at all clears -> the honest sentence.
  const bestDriver = (ds.candidates || []).filter(c => c.kind === "driver").sort((a, z) => z.tighten - a.tighten)[0];
  if (!ds.wideBand) {
    earned = pickMileageOrTx();                       // tight band: mileage as today
  } else if (bestDriver && !(refined && refine.driver)) {
    const drv = driverByKey(base.vehicle, bestDriver.driverKey);
    earned = drv ? { kind: "driver", driverKey: drv.key, q: drv.q, yes: drv.yes, no: drv.no, family: drv.family } : pickMileageOrTx();
  } else {
    earned = pickMileageOrTx();                       // wide band, no qualifying dictionary flag -> mileage/gearbox
    // Wide band and truly nothing splits 5+/5+ (no dictionary, no mileage, no gearbox): one honest sentence.
    if (!earned) driverSentence = "These vary for reasons the sales record can't fully see, provenance and originality mostly. The titles below say which is which.";
  }

  // MILEAGE NEAREST (Part 3 item 4, up-front case): when the INPUT gave a mileage and fewer than 3
  // sales sit in its band, surface the 3 nearest in mileage as a labelled set so a mileage-specific
  // read never dead-ends. The refine-chip case is handled above (base.mileageFallback); this covers a
  // mileage typed with the original query. Never adjusts a number, only which sales are shown.
  let nearestInMiles = null;
  if (!refined && Number(base.subjectMileage) > 0) {
    const target = Number(base.subjectMileage);
    const withMi = solid.filter(r => miOf(r) > 0);
    const bucket = (buckets || []).find(bk => target >= bk.min && (bk.max == null || target < bk.max));
    const inBand = bucket
      ? withMi.filter(r => { const m = miOf(r); return m >= bucket.min && (bucket.max == null || m < bucket.max); })
      : withMi.filter(r => Math.abs(miOf(r) - target) <= target * 0.25);
    if (inBand.length < 3 && withMi.length >= 3) {
      const nearest = withMi.slice().sort((a, z) => Math.abs(miOf(a) - target) - Math.abs(miOf(z) - target)).slice(0, 3);
      nearestInMiles = { target, label: "Nearest in miles", inBand: inBand.length, cards: shapeCards(nearest) };
    }
  }

  // TRIMS COVERED (Part 3): when the shown pool spans more than one trim, name them so Lane C's eyebrow
  // can read "992 Carrera S and T Coupes". Mutates the shared resolvedCar object (carried on the result).
  const covered = detectSubTrims(solid, spec.make, spec.model);
  if (base.resolvedCar) base.resolvedCar.trimsCovered = covered.length > 1 ? covered : null;

  // SAM'S TAKE (Part 3 items 1 + 6): renders ONLY at the cluster tier (16+). 8-15 is count-forward
  // with no Take, and the stronger-vs-weaker split needs two 8-sale halves anyway. The sentence is
  // held to <=2 sentences / <=30 words with a banned-word lint; a Take that fails is dropped and the
  // reason logged in samsTakeSkipReason (telemetry, never rendered).
  let samsTakeOut = null, samsTakeSkipReason = null;
  // Divergence guard (Oct 2026, 964 Turbo VIN review): the subject's own in-window sale sitting
  // materially outside the displayed range (computeDivergence) means a reader sees that sale
  // front and center, inches above a Take sentence about a pool it was excluded from. A true
  // statement about a pool the reader can see contradicted is worse than no sentence - never
  // render Sam's Take when the exact car itself is the known outlier.
  if (divergence) {
    samsTakeSkipReason = "subject's own sale diverges from the range (computeDivergence) - a pattern sentence about the pool it was excluded from would read as contradicted";
  } else if (rangeTier === "cluster") {
    const raw = samsTake(solid);
    if (!raw) samsTakeSkipReason = "no separating pattern cleared the thresholds";
    else { const chk = enforceSamsTake(raw); if (chk.ok) samsTakeOut = { ...raw, sentence: chk.sentence }; else samsTakeSkipReason = chk.reason; }
  } else {
    samsTakeSkipReason = `pool tier ${rangeTier} below the 16-sale cluster tier`;
  }

  // MARKET CHECK ENGINE ADDITIONS (Oct 2026), items 1 to 4's sync half - all read off pools already
  // in memory (recent/prior/solid/aside), zero extra fetches. Item 4's didNotSellCount and item 6's
  // soldBefore need a real auction_attempts/VIN query, so those are attached in runOneBox AFTER this
  // tier is confirmed "result" (same place freshness is already attached post hoc) - never doubled
  // on the rare second buildResult call (the wide-band description re-render), and never run at all
  // on a tier this function does not reach.
  const soldCount = countWord(solid.length);
  // ONE POOL for the headline AND the over-time read (comparable-fences job, Oct 2026): quarterlyBands/
  // yearOverYearDirectionFor each run their OWN r4Split on recent/prior (by design - a quarter's band
  // is read the identical way the headline's is, see quarterlyBandsFor's own comment), but recent/prior
  // themselves are sliced from the RAW `rows` upstream of the provenance/engine-swap/halo set-aside
  // below - so an unfenced quarter could show a modified or ex-celebrity car the headline range
  // explicitly excludes, for the identical window. counts.qualifying/solid/aside must NOT change (a
  // set-aside car still needs to be countable there), so the fence is applied here, locally, only for
  // these two over-time reads, not upstream on `recent`/`window` itself.
  // FIXED (job 7, Oct 2026): the old fenceOut re-derived only THREE of the set-aside reasons
  // (provenance/engine-swap/model-specific-halo) and never consulted r._tag - so a COVERED model's
  // own rule5PoolGuard exclusions (and the make-level halo set-aside above) stayed IN the quarterly/
  // year-over-year pool while the headline's `solid` had already removed them, two different pools
  // from the same starting rows. By this point every excluded row (covered-model tag, provenance,
  // engine swap, model-specific halo, make-level halo) carries r._tag - checking it alone is both
  // simpler and correct for both covered and uncovered models (r4Split's own per-row price outliers
  // are deliberately NOT tagged here, so an uncovered model's quarters still apply their own r4Split
  // fence below, unchanged - see quarterlyBandsFor's own comment).
  const recentFenced = recent.filter(r => !r._tag), priorFenced = prior.filter(r => !r._tag);
  // SALES WINDOW (job 7): the actual earliest sale date counted in the headline window - never a
  // nominal cutoff that might predate any real evidence - so a consumer can print the real period
  // ("sales since March 2025") instead of only the rolling label ("last twelve months"). Computed
  // BEFORE the trailing periods below (job 4 addendum) so they can partition the EXACT headline span.
  const windowStart = window.length ? window.map(r => r.auction_end_date).filter(Boolean).sort()[0] || null : null;
  // TRAILING THREE-MONTH PERIODS (job 4 addendum, Oct 2026, REPLACES calendar quarters - see
  // tradingPeriodsFor's own comment for the full reasoning). recentFenced IS solid restricted to the
  // recent window when useRecent is true (window === recent then, and solid = window.filter(!_tag) by
  // this point for both covered and uncovered models) - the identical rows the headline cluster
  // itself is built from, never a second derivation.
  const trading = tradingPeriodsFor(recentFenced, windowStart, iso(0), useRecent);
  const quarterlyBands = trading ? trading.periods : null;
  const rowsNotShownCount = trading ? trading.rowsNotShownCount : null;
  const yoyDirection = yearOverYearDirectionFor(recentFenced, priorFenced, keepAll, useRecent, isCoveredModel);
  const setAsideCount = aside.length ? countWord(aside.length) : 0;
  let setAsideReasons = null;
  if (aside.length) {
    setAsideReasons = { modified: 0, project: 0, replica: 0, "odd sale": 0 };
    for (const r of aside) { const k = setAsideReasonFor(r); setAsideReasons[k] = (setAsideReasons[k] || 0) + 1; }
  }
  counts.setAside.reasons = setAsideReasons;

  // REFERENCE FIGURE (Oct 2026, business tooling only - never wired to a consumer page). Computed
  // from the SAME pool and the SAME typical band (cluster) that sets this result's own range, never
  // a separate query. Method, one sentence for an auditor: the amount is the middle point of the
  // typical price band formed by the sales already in this pool, so a pool whose cars run higher
  // mileage naturally sold for less and the figure moves down with it already baked into the real
  // sale prices, with no separate mileage adjustment of any kind. Gate: only when the range is
  // itself shown (cluster exists, the same 8 sale floor the headline uses); otherwise null with a
  // short reason. Confidence from two already-used engine concepts, not new thresholds: the 16 sale
  // cluster floor (rangeTierForCount), and the 40 percent band width r4DriverSearch already calls
  // wide. No valuation words, no "median" and no dashes in basis or the reason string.
  let referenceFigure = null, referenceFigureReason = null;
  if (cluster) {
    const amount = Math.round((cluster[0] + cluster[1]) / 2);
    const widthRatio = amount > 0 ? (cluster[1] - cluster[0]) / amount : 1;
    const tight = widthRatio <= 0.40;
    const confidence = solid.length >= 16 ? (tight ? "high" : "medium") : (tight ? "medium" : "low");
    referenceFigure = {
      amount, rangeLow: cluster[0], rangeHigh: cluster[1], salesCount: solid.length,
      windowLabel: windowLabel || null, confidence,
      basis: `The midpoint of the range most sales landed in, across ${solid.length} sales over ${windowLabel || "the shared archive"}.`
    };
  } else {
    referenceFigureReason = `pool tier ${rangeTier} is below the range threshold, so there is no typical band to build a figure from`;
  }

  // Same-half preference inputs (half-generation job): spec.halfGenOwnHalf was already set in
  // buildSpec from the seller's own year; halfOfFn classifies any OTHER row by its own year so
  // pickRepresentative can compare. Both null for a model with no half-generation table entry -
  // pickRepresentative then behaves exactly as before this change (no cross-half comparison at all).
  const halfGenEntry = halfGenerationFor(spec.make, spec.model);
  const halfOfFn = halfGenEntry ? (r => { const h = halfForYear(halfGenEntry, r.year); return h ? h.code : null; }) : null;
  // Part 5/6 (Oct 2026): priorFenced is the engine's own prior-year rows (already computed above for
  // yoyDirection, same fence, never a second derivation), feeding trend.priorYear.
  const trendResult = trendFor(solid, priorFenced);

  return {
    ...b, tier: "result", ladderStep: chosen.step, widening: chosen.widening || null,
    // APPLIED CHOICE ON resolvedCar (e41, Sam's Job 2): a body or trim the refine applied is written onto the car the
    // engine returns (bodyStyle / trim) with the choice under `applied`, so every product reads the same car.
    resolvedCar: b.resolvedCar || null,
    // Market Check engine additions (Oct 2026), item 1: the pool that set the range, as a market
    // fact a page can print directly ("42 sold in the past year"). soldCount reads as a word under
    // ten (the shared number helper); windowLabel already existed on this object.
    soldCount,
    soldCountN: solid.length,   // e60 (Sam): the numeric sibling of soldCount, an addition; soldCount is unchanged
    // Job 7 (Oct 2026): the earliest sale date actually counted in the headline window - a real date,
    // never a nominal cutoff - so a consumer can print the period ("sales since March 2025") instead
    // of only the rolling windowLabel.
    // windowStart / windowMonths / windowWords (Sam, Oct 14 2026): the window the receipts behind poolSize
    // actually cover - earliest sale date in the pool, its length in months, and the plain words built
    // from them (windowFactsFor) - on every tier. The local windowStart above (pre-fence rows) stays the
    // trading-periods input only.
    ...windowFactsFor(solid, useRecent),
    // Item 2 (job 4 addendum, Oct 2026): four TRAILING THREE-MONTH periods partitioning the exact
    // headline window (windowStart to now), newest first - never calendar quarters (see
    // tradingPeriodsFor's own note for why). Null when the headline widened past twelve months
    // (useRecent false). A period below RANGE_THRESHOLD is omitted entirely (no thin flag, no empty
    // row); its rows are folded into rowsNotShownCount instead, so shown-period counts plus
    // rowsNotShownCount always sum to soldCount exactly - the arithmetic is never hidden.
    quarterlyBands,
    rowsNotShownCount,
    // Item 3: year-over-year direction read off the identical recent/prior windows the headline's
    // own direction nudge already splits (see `direction` below) - see yearOverYearDirectionFor.
    // yoyDirection.status is the ENGINE's wording flag ("higher"/"lower"/"flat") for Lane A to print
    // directly - Lane A never computes or chooses this word itself (job 4 addendum).
    yoyDirection,
    // Item 4 (set-aside half): every row already excluded from the band/count above (provenance,
    // engine swap, halo, the model-specific special-edition/restomod tags, or - for an uncovered
    // model - r4Split's own price fence), bucketed into the four reasons a reader can act on.
    // Never enters soldCount, cluster or span above; didNotSellCount (the other half of item 4) and
    // soldBefore (item 6) are attached after this tier is confirmed, see runOneBox.
    // setAsideRows (item 10, e47): every row set aside from this pool, with its reason words, flagged setAside; the
    // count plus poolSize is the qualifying total (every fenced row of the window).
    setAsideCount, setAsideCountN: aside.length, setAsideReasons, setAsideRows: shapeCards(aside).map((c, i) => ({ ...c, reason: setAsideReasonFor(aside[i]), setAside: true })), qualifyingTotal: solid.length + aside.length, counts, bodyScoped,
    // Business tooling only (see the computation above for the method and the gate) - never read
    // by any consumer-facing surface; STANDING CHECK before adding a renderer anywhere: this field
    // must never reach a page a buyer or seller sees.
    referenceFigure, referenceFigureReason,
    // Item 4: the gearbox line shows on a card only when the gearbox question applies (pool has both a
    // manual and a non-manual box); an all-manual car (Cobra) never shows "Manual" on its hero.
    gearboxApplies: !!(base && base.gearboxApplies),
    // Capped third splits (Part 3 question cap): rendered as lines in the result, not asked.
    inlineSplits: (base && base.inlineSplits && base.inlineSplits.length) ? base.inlineSplits : null,
    // Mileage nearest-sales fallback (Part 3): set when a too-thin mileage band fell back to the
    // closest sales by mileage, so the copy says so honestly instead of claiming an exact band.
    mileageFallback: (base && base.mileageFallback) || null,
    // Up-front mileage nearest set (item 4): the 3 nearest-in-mileage sales when the input gave a
    // mileage and its band held fewer than 3. Null on the normal path.
    nearestInMiles,
    poolTrim: exactStep ? (spec.trim || null) : (chosenTrimName || null),
    poolYears: poolYrs.length ? [Math.min(...poolYrs), Math.max(...poolYrs)] : null,
    // Set only when the trim's own title-keyword search also came up thin and the pool fell
    // through to the plain model (the family/family_wide rungs above) - tells the seller plainly
    // that this is the wider car's range, not a trim-specific one, instead of staying silent.
    askNarrow: chosen.askNarrow || undefined,
    // RANGE LADDER (Part 3): the bucket this pool landed in, read the same way by every surface.
    //   cluster (16+): cluster band + Sam's Take | band (8-15): middle-half band, count-forward |
    //   thin (3-7): the sales themselves, NO range. `olderOutside` carries the count of older sales
    // held out of a recent-scoped thin view, for the "N more sold in 2023 and 2024" line.
    rangeTier, olderOutside,
    // span (the min-to-max "everything from X to Y has sold" figure) is SUPPRESSED on the thin tier:
    // 3-7 sales get no range of any kind (Part 3 item 1). cluster stays the typical-band carrier.
    span: (rangeTier === "thin" || rangeTier === "single" || rangeTier === "none") ? null : span,
    cluster, direction, driver, divergence,
    // Freshness inputs (S2-2): the newest sale in the pool + whether this pool is house-led, so
    // runOneBox can stamp the pool-aware freshness line. House-led = houses are half or more.
    newestSale: obNewestDate(solid), houseLed: solid.filter(r => isHouseSource(r.source)).length >= solid.length / 2,
    // Span-without-cluster state (#4): a real result with too few sales (<8) to mark a
    // typical band. The render shows the full range + every sale, honestly caveated.
    spanOnly: !cluster, poolN: solid.length,
    setAsideTags: outlierTags(aside),
    platforms, topPlatform: named[0] || null, singlePlatform: named.length <= 1,
    earned, driverSentence,
    // Body style question (Oct 2026): independent of `earned`, rendered alongside it. Null once
    // answered (refine.body) or when the query itself already pins a single body style.
    bodyOptions, bodyUnspecified,
    // Trim question (item 2, Oct 2026): independent of `earned`/bodyOptions, same place and style.
    // Null once answered (refine.trim) or when the query itself already names a trim.
    trimQuestion,
    // Item 9: the observable-fact refinement OFFER - only the flags the pool actually contains
    // (>=3 cars, from title/mods/title-status/known-flaws). Suppressed once a refinement is active.
    observeOffer: refined ? [] : (function () { const pool = solid.concat(aside); return OBSERVE_ORDER.map(k => ({ key: k, label: OBSERVE_FLAGS[k].label, n: pool.filter(r => OBSERVE_FLAGS[k].re.test(obText(r))).length })).filter(o => o.n >= 3); })(),
    observeAside,
    // Telemetry only (never rendered): the driver-search candidates + dictionary split counts, so
    // the selection can be audited (why mileage/gearbox/dictionary won).
    driverDiag: { wideBand: ds.wideBand, band: ds.fullBand != null ? Math.round(ds.fullBand * 100) : null, candidates: (ds.candidates || []).map(c => ({ k: c.kind === "driver" ? c.driverKey : c.kind, t: Math.round((c.tighten || 0) * 100) })), dict: ds.dictDiag || [] },
    refined: refined ? { label: refine.label || null, mileage: refine.miMin != null, tx: refine.tx || null, driver: refine.driver || null, body: refine.body || null, trim: refine.trim || null, docHistory: refine.docHistory || null } : null,
    // Render-port (round 7): three representative sales, subject-excluded, for the cards3 layout.
    representative: pickRepresentative(solid, base.exactSale, cluster || span, driver, divergence, spec.halfGenOwnHalf, halfOfFn, contextYearWindow(spec)),
    // Half-generation facts (Oct 2026, half-generation job): exposed so a page can label a cross-
    // half context card (pickRepresentative's sameHalf flag on each card) and say why a split did
    // or did not apply. Null/false when this model has no half-generation table entry at all.
    halfGeneration: spec.halfGenAvailable ? { ...spec.halfGenAvailable, ownHalf: spec.halfGenOwnHalf || null, splitApplied: !!spec.halfGenSplit } : null,
    // Sam's Take (v1): stronger-vs-weaker-half pattern read on the sales behind the range. Null when
    // too thin; the frontend renders the section only when a sentence comes back. Snapshot attributes
    // are worded "as listed at the time of sale". Only meaningful once a real band stands (8+ solid).
    samsTake: samsTakeOut, samsTakeSkipReason,
    // "Shown separately" is ONLY the Rule 5 tagged VARIANTS (CSL, Heritage, Scuderia, restomod,
    // year-mismatch...), never a price/mileage outlier (fix 5: mileage is not a variant - a high-mile
    // car stays in the range). asideCards keeps the full aside for internal use; taggedCards is what
    // the "Shown separately" group renders.
    cards: shapeCards(solid), asideCards: shapeCards(aside), taggedCards: shapeCards(aside.filter(r => r._tag)), rawPool: solid, recent3: lastThreeDistinct(shapeCards(solid)),
    // Part 5/6 Market Check design fields (Oct 2026, corrected by Sam same day): all computed from
    // THIS SAME solid pool (and, for priorYear, the engine's own already-fenced prior-year rows) -
    // never a separate query. See the helper functions above buildResult for what each one is and
    // its own gate. identityQuestion/trend/distribution/strip/contextRoles are additive data fields
    // on the existing result/thin tiers - they do not change fallbackRung/tier control flow.
    contextRoles: contextRolesFor(solid, cluster, !!chosen.widening || windowLabel === "widened years"),
    identityQuestion: identityQuestionForAnswer(trimQuestion, bodyOptions, bodyUnspecified),
    trend: trendResult,
    distribution: distributionFor(solid),
    strip: trendResult ? null : stripFor(solid)
  };
}

// Market Check engine additions, item 4's second half: cars that did NOT sell (auction_attempts),
// for the same spec and the same window the pool above landed on. auction_attempts carries no
// title, so trim cannot be filtered here (the same honest limit reserveInsightForVehicle already
// lives with) - make+model(+chassis-code union)+year only. Never enters the band or soldCount.
async function didNotSellForSpec(spec, sinceIsoDate, env) {
  try {
    if (!spec || !spec.make || !spec.model || !env) return { count: 0, rows: [] };
    const modelTok = String(spec.model).trim();
    const codeTok = spec.genCode ? String(spec.genCode).trim() : null;
    const modelFilter = (codeTok && codeTok.toLowerCase() !== modelTok.toLowerCase())
      ? `&or=(model.ilike.${encodeURIComponent("*" + modelTok + "*")},model.ilike.${encodeURIComponent("*" + codeTok + "*")})`
      : `&model=ilike.${encodeURIComponent("*" + modelTok + "*")}`;
    let q = `auction_attempts?select=source_slug,attempt_date,high_bid,auction_status,url:raw_record->>url,srcurl2:raw_record->>source_url` +
      `&make=ilike.${encodeURIComponent("*" + spec.make + "*")}${modelFilter}&attempt_date=gte.${sinceIsoDate}`;
    if (spec.yearMin) q += `&year=gte.${spec.yearMin}`;
    if (spec.yearMax) q += `&year=lte.${spec.yearMax}`;
    const rows = (await supabaseSelectAll(env, q)) || [];
    const mapped = rows.map(a => ({
      date: a.attempt_date || null, highBid: Number(a.high_bid) || null, status: a.auction_status || null,
      platform: platNamed(a.source_slug) || null, url: a.url || a.srcurl2 || null
    })).filter(a => a.date || a.highBid);
    return { count: mapped.length, rows: mapped };
  } catch { return { count: 0, rows: [] }; }
}

// Market Check engine additions, item 6: for every sale card in the pool, the same car's earlier
// sale when one exists - VIN match first (one batched query on the indexed vin_norm column, the
// same identity findVinArchiveMatch/lib/_flags.js uses, never N queries for N cards), listing match
// as the fallback for a car with no VIN at all (pre-1981 chassis-style archive rows): the same
// same-car key (title + mileage rounded to the nearest 500) lastThreeDistinct already uses, checked
// only against what this query already fetched (no second unbounded archive scan). Mutates `cards`
// in place; `rawPool` and `cards` are built from the same array in the same order (shapeCards), so
// index i always names the same sale on both sides.
function sameCardKeyFor(c) { const mi = Number(c && c.mi) || 0; return mi > 0 ? String((c && c.title) || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + "|" + Math.round(mi / 500) : null; }
async function attachSoldBefore(cards, rawPool, env) {
  if (!cards.length || !env) { for (const c of cards) c.soldBefore = null; return; }
  const vinOf = r => { const v = String(r.vin_norm || "").trim(); return v || null; };
  const vins = [...new Set(rawPool.map(vinOf).filter(Boolean))];
  let byVin = new Map();
  if (vins.length) {
    try {
      const q = `sales_archive?vin_norm=in.(${vins.map(v => encodeURIComponent(v)).join(",")})` +
        `&select=vin_norm,sale_date,sale_price,url:raw_record->>url,srcurl2:raw_record->>source_url&order=sale_date.asc`;
      const earlier = (await supabaseSelectAll(env, q)) || [];
      for (const e of earlier) { if (!byVin.has(e.vin_norm)) byVin.set(e.vin_norm, []); byVin.get(e.vin_norm).push(e); }
    } catch { byVin = new Map(); }
  }
  // Listing-match fallback keys off this SAME fetched pool only (no VIN on either side) - an honest,
  // bounded answer, not a full archive scan for a car with no unique identifier.
  const byListingKey = new Map();
  for (let i = 0; i < cards.length; i++) {
    if (vinOf(rawPool[i])) continue;
    const key = sameCardKeyFor(cards[i]);
    if (!key) continue;
    if (!byListingKey.has(key)) byListingKey.set(key, []);
    byListingKey.get(key).push(cards[i]);
  }
  for (let i = 0; i < cards.length; i++) {
    const row = rawPool[i], card = cards[i];
    const ownDate = String(card.date || "").slice(0, 10);
    const v = vinOf(row);
    if (v) {
      const earlierSales = (byVin.get(v) || []).filter(e => String(e.sale_date || "").slice(0, 10) < ownDate);
      card.soldBefore = earlierSales.length
        ? { date: earlierSales[earlierSales.length - 1].sale_date || null, price: Number(earlierSales[earlierSales.length - 1].sale_price) || null, link: earlierSales[earlierSales.length - 1].url || earlierSales[earlierSales.length - 1].srcurl2 || null }
        : null;
      continue;
    }
    const key = sameCardKeyFor(card);
    const group = key ? (byListingKey.get(key) || []) : [];
    const earlierCard = group.filter(c => String(c.date || "").slice(0, 10) < ownDate).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
    card.soldBefore = earlierCard ? { date: earlierCard.date || null, price: earlierCard.price ?? null, link: earlierCard.url || null } : null;
  }
}

// VIN PAGE INDEX RULE (Lane B job, Oct 2026, Part 5, FOR LANE A): hasHistoryPage mirrors api/
// history.js's own index gate (two or more priced appearances, a real VIN, a make and model family,
// live photos) so "Sold before" can link to a car's history page only when that page is actually
// indexable - never a link landing on a noindex page. Same batched-query discipline as
// attachSoldBefore just above (one query for every card's VIN, never N queries for N cards).
// CONSERVATIVE BY DESIGN: pricedCount here counts sales_archive rows only (this engine's own table);
// api/history.js's own appearances also include unsold auction_attempts bids, so a car whose second
// appearance was a bid, not a sale, undercounts here and reads hasHistoryPage:false when the real
// page is indexable. Undercounting is the safe direction for a "never link to noindex" rule - it
// never claims a page is linkable when it is not. realVin/deadPhotos are small, local re-reads of
// api/history.js's own tiny checks (a regex and one 10-minute-cached app_config row), not an import -
// that file is Lane A's, read-only to every other lane by the header note at the top of this file.
const realVinLocal = v => /^[A-Z0-9]{5,17}$/.test(String(v || "")) && /\d/.test(String(v || ""));
let DEAD_VINS = null, DEAD_VINS_AT = 0;
async function deadPhotoVins(env) {
  if (DEAD_VINS && Date.now() - DEAD_VINS_AT < 600e3) return DEAD_VINS;
  try {
    const rows = await supabaseSelect(env, "app_config?key=eq.history_photo_dead&select=value&limit=1");
    const v = Array.isArray(rows) && rows[0] ? (typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value) : {};
    DEAD_VINS = new Set((v && v.vins) || []); DEAD_VINS_AT = Date.now();
  } catch { DEAD_VINS = new Set(); }
  return DEAD_VINS;
}
async function attachHistoryPage(cards, rawPool, env) {
  if (!cards.length || !env) { for (const c of cards) c.hasHistoryPage = false; return; }
  const vinOf = r => { const v = String(r.vin_norm || "").trim(); return v || null; };
  const vins = [...new Set(rawPool.map(vinOf).filter(Boolean))];
  let counts = new Map(), dead = new Set();
  if (vins.length) {
    try {
      const q = `sales_archive?vin_norm=in.(${vins.map(v => encodeURIComponent(v)).join(",")})&sale_price=not.is.null&select=vin_norm`;
      const rows = (await supabaseSelectAll(env, q)) || [];
      for (const r of rows) counts.set(r.vin_norm, (counts.get(r.vin_norm) || 0) + 1);
      dead = await deadPhotoVins(env);
    } catch { counts = new Map(); }
  }
  for (let i = 0; i < cards.length; i++) {
    const row = rawPool[i], card = cards[i];
    const v = vinOf(row);
    card.vinNorm = v;
    card.hasHistoryPage = !!(v && realVinLocal(v) && (counts.get(v) || 0) >= 2 && row.make && (row.model || row.model_family) && !dead.has(v));
  }
}

// FINAL STAMP (singleflight bump, Oct 18 2026): everything the answer gains at the end of runOneBox (poolYears, readAt, the
// e60 lines, the e61 numbers and flag, question-first) in ONE function, applied on EVERY return path. The sibling,
// trim-any-year and model-any-year paths returned before this block, so a 1990 911 Targa 4 (a widened answer) came
// back without the e61 fields. Same stamps, same order, nothing else changed.
// TRIM QUESTION FROM THE SALES (e62, Sam, choice A): a row's trim word is read from its OWN title, never from a list per
// model: the title minus the year, make and model words, then the first word the shared trim gate admits (the trim
// vocabulary, or a letter-and-digit code such as 330i or M340i). Rows with no such word fold into "Other trims".
import { trimTokenAllowed as obTrimTokenAllowed } from "./vehicle.js";
const obNormWord = w => String(w || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function rowTrimWord(r, spec) {
  const skip = new Set([spec.make, spec.model, ...(String(spec.model || "").split(/[\s-]+/)), ...(String(spec.make || "").split(/[\s-]+/))].map(obNormWord).filter(Boolean));
  const words = String(titleOf(r) || "").replace(/^[\d,.]+k?-?mile\s+/i, "").split(/\s+/);
  for (const w of words) {
    const n = obNormWord(w);
    if (!n || /^(19|20)\d\d$/.test(n) || skip.has(n)) continue;
    if (obTrimTokenAllowed(w)) return w.replace(/[^A-Za-z0-9]/g, "");
  }
  return null;
}
export function trimGroupsFromSales(rows, spec) {
  const by = new Map(); let other = 0;
  for (const r of rows || []) {
    const w = rowTrimWord(r, spec);
    if (!w) { other++; continue; }
    const k = obNormWord(w);
    const g = by.get(k) || { value: k, label: w, n: 0 };
    g.n++; by.set(k, g);
  }
  const named = [...by.values()].filter(g => g.n >= 3).sort((a, b) => b.n - a.n);
  const folded = [...by.values()].filter(g => g.n < 3);
  other += folded.reduce((a, g) => a + g.n, 0);
  return { named, other, foldedValues: folded.map(g => g.value) };
}
function trimChoicePrompt(labels) { return `These sold as ${joinList(labels)}, and they price differently. Which one is it?`; }
// THE THIN LINE (e63, Sam's approved wording): one engine-carried line on every thin answer saying why no range is shown,
// by reason code. "Not enough sales" appears ONLY under few_sales, so a pool of eight or more is never told it has too few.
// house_share: the auction rooms carry two thirds or more of the pool (thin.houseSteer); few_sales: fewer than eight
// included sales in all; few_comparable: eight or more, but fewer than eight online sales with a photo to compare.
export const THIN_LINES = {
  house_share: "The sales of this car are too one-sided to mark a range from. These are the sales we found.",
  few_sales: "Not enough sales of this exact car to give a reliable range. These are the sales we found.",
  few_comparable: "Too few of these sales can be compared side by side to give a reliable range. These are the sales we found."
};
export function thinReasonFor(thin, includedN) {
  if (thin && thin.houseSteer) return "house_share";
  return Number(includedN) >= 8 ? "few_comparable" : "few_sales";
}
function finalStamp(result, { spec, resolvedCar, asked, askCapped, mark, refine }) {
  // POOL YEARS ON EVERY RUNG (Sam, Oct 15 2026, for the next bump): the year span of the pool the answer actually used
  // (its own rawPool), on every tier and rung, widened or not, so a page reads the years from a field and never from the
  // rungLabel text; the same field on all four products (coreOf passes it through). buildResult set it only on the
  // pre-widening result pool, so it was empty on exactly the cars that widen (275 GTB, CLK DTM, Merkur XR4Ti).
  if (result && typeof result === "object") {
    const yrs = (Array.isArray(result.rawPool) ? result.rawPool : []).map(r => Number(r && r.year)).filter(y => Number.isFinite(y) && y > 1800);
    result.poolYears = yrs.length ? [Math.min(...yrs), Math.max(...yrs)] : (Array.isArray(result.poolYears) ? result.poolYears : null);
    // readAt (Sam, Oct 16 2026, Lane A's shared card): the ISO time this answer was read from the archive. A stored
    // answer keeps its own stamp (it is the stored row's read), so a page always shows when the sales were read.
    result.readAt = new Date().toISOString();
    // e60 (Sam): the newest and the oldest sale the answer used, from its own included rows (ISO dates), so a card can say
    // "the latest in {Month Year}" and never a month count.
    const dts = (Array.isArray(result.rawPool) ? result.rawPool : []).map(r => String((r && (r.auction_end_date || r.sale_date)) || "").slice(0, 10)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    result.latestSaleDate = dts.length ? dts[dts.length - 1] : null;
    result.oldestIncludedSaleDate = dts.length ? dts[0] : null;
    // e60 (Sam's wording): "Latest sale: {Month Year}."; "Includes sales from {Year}." only when the oldest included
    // sale is more than three years old; the shared card's basis "Based on N sales, the latest in {Month Year}." with N
    // in words under ten. No month count on any product.
    const monthYear = d => { const m = /^(\d{4})-(\d{2})/.exec(String(d || "")); return m ? `${MONTH_FULL[Number(m[2]) - 1]} ${m[1]}` : null; };
    result.latestSaleLine = result.latestSaleDate ? `Latest sale: ${monthYear(result.latestSaleDate)}.` : null;
    const oldestT = result.oldestIncludedSaleDate ? Date.parse(result.oldestIncludedSaleDate + "T00:00:00Z") : NaN;
    result.includesFromLine = (Number.isFinite(oldestT) && (obNow() - oldestT) > 3 * 365.25 * 864e5) ? `Includes sales from ${String(result.oldestIncludedSaleDate).slice(0, 4)}.` : null;
    result.basisLine = (dts.length && result.latestSaleDate) ? (dts.length === 1 ? `Based on one sale, in ${monthYear(result.latestSaleDate)}.` : `Based on ${countWord(dts.length)} sales, the latest in ${monthYear(result.latestSaleDate)}.`) : null;   // e65: one sale reads "one sale", never "one sales"
    // e61 (Sam, Oct 18 2026): the included sales' EXACT lowest and highest sale prices, unrounded, from the same rows the
    // range is built from (span is the rounded rail, these are the sales themselves), on every tier that has included
    // rows; and wideSpread, on the result tier only, true when the printed range's high is more than double its low
    // (the middle-half range after its rounding, so the flag can never disagree with the card's own numbers).
    const usd = (Array.isArray(result.rawPool) ? result.rawPool : []).map(r => Number(r && (r._usd ?? r._allin ?? r._hammer))).filter(x => Number.isFinite(x) && x > 0);   // e62: thin rows carry _allin, not _usd
    result.lowestSaleN = usd.length ? Math.round(Math.min(...usd)) : null;
    result.highestSaleN = usd.length ? Math.round(Math.max(...usd)) : null;
    if (result.tier === "result") {
      const cl = Array.isArray(result.cluster) && result.cluster.length === 2 ? result.cluster : null;
      result.wideSpread = !!(cl && Number(cl[0]) > 0 && Number(cl[1]) > 2 * Number(cl[0]));
      // QUESTION FIRST (Sam, Oct 18 2026): when the range is wide AND the answer carries a body split, the body question
      // comes BEFORE any range, as the blocking body question does today, on every product; the chosen body's answer
      // prints its own range and its own flag. The two-question cap still applies (askCapped: the pool answers with the
      // range and the note instead of a third question), which is also the path Buy and Tasks take (asked 2).
      const iq = result.identityQuestion;
      if (result.wideSpread && !askCapped && iq && iq.dimension === "body" && Array.isArray(iq.options)) {
        const opts = iq.options.filter(o => o && o.value !== "unspecified" && o.label && Number(o.n) > 0);
        if (opts.length >= 2) {
          mark("done");
          return { tier: "body_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec, prompt: bodyPrompt(opts.map(o => o.label)), bodyOptions: opts.map(o => o.label), optionCounts: opts.map(o => Number(o.n)), wideSpread: true, questionFirst: "wide_spread" };
        }
      }
    }
    // TRIM QUESTION FIRST (e62, Sam, choice A): a wide result or a "too spread out" refusal whose included sales split
    // into two or more trims of at least three sales each asks which trim BEFORE any range. Chips come only from the
    // included sales of this car and year, each with its count (a word under ten); trims under three fold into
    // "Other trims ({count})", shown only when it holds a sale, so the chips always add up to the pool. The chosen
    // trim's answer is read on its own (a range at eight or more, the sales themselves under eight, and "Sales too
    // spread out for a range." only if that trim alone is still too spread out).
    const wideOrVaried = (result.tier === "result" && result.wideSpread) || (result.tier === "refusal" && result.refusal && result.refusal.kind === "varied");
    if (wideOrVaried && !askCapped && !spec.trim && !(refine && refine.trim)) {
      const tg = trimGroupsFromSales(result.rawPool || [], spec);
      if (tg.named.length >= 2) {
        const opts = tg.named.map(g => ({ value: g.value, label: g.label, n: g.n }));
        if (tg.other > 0) opts.push({ value: "other", label: "Other trims", n: tg.other, notTrims: tg.named.map(g => g.value) });
        const chips = opts.map(o => `${o.label} (${countWord(o.n)})`);
        mark("done");
        return { tier: "trim_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec, prompt: trimChoicePrompt(tg.named.map(g => g.label)), trimOptions: opts, trimChips: chips, optionCounts: opts.map(o => o.n), wideSpread: result.tier === "result" ? true : undefined, questionFirst: result.tier === "result" ? "wide_spread" : "too_spread_out" };
      }
    }
  }
  mark("done");
  return result;
}
export async function runOneBox(vehicle, generation, searchText, env, refine) {
  try { await ensureFxReady(env); } catch (e) {}   // item 1: arm sale-date FX for every conversion downstream
  const spec = buildSpec(vehicle, generation, searchText);
  // Ambiguous bare "Blazer" (1983-1994, no full-size/compact clue): ask K5 vs S-10 rather than guess.
  // Reuses the generation_choice shape (chips re-query the explicit model), so no frontend change.
  if (spec.blazerAsk) {
    const yr = spec.year ? spec.year + " " : "";
    return {
      tier: "generation_choice", askIndex: (Number(env && env.asked) || 0) + 1,
      resolvedCar: { year: spec.year || null, make: "Chevrolet", model: "Blazer", trim: "", genCode: null, badge: null, bodyStyle: null, transmission: null, familyLabel: "Blazer" },
      resolvedSpec: spec.resolvedSpec || null,
      prompt: `A ${spec.year || ""} Chevrolet Blazer came as the full-size K5 and the compact S-10, which price very differently. Which is it?`.replace(/\s+/g, " ").trim(),
      generationOptions: [
        { label: "K5 Blazer (full-size)", query: `${yr}Chevrolet K5 Blazer` },
        { label: "S-10 Blazer (compact)", query: `${yr}Chevrolet S-10 Blazer` }
      ]
    };
  }
  // A TYPED BODY NEVER WIDENS (Sam, Oct 16 2026, e56): a body word in the typed car ("1969 Chevrolet Camaro
  // convertible") is answered exactly like the Convertible chip: the bare car's ladder picks the rung, then the body
  // narrows that pool (buildPool's body refine, title words only), and no rescue widens past it. Before this a typed
  // body ran its own ladder with the body as a fetch-time filter, so the Camaro's typed "convertible" widened to
  // 1967 to 1969 (24) while the chip opened 3. Not applied when a title-split family decides the pool (familyInclude:
  // a 275 GTS is its own pool, the GTS is not a body filter) or when a chip already carries a body.
  // e57: a TRIM that is exactly a body word ("Fastback", "Targa": the resolver files them as trims) is the body chip too,
  // never a trim title search (typed "1965 Ford Mustang fastback" read 15 against the chip's 12, "2005 Porsche 911 targa"
  // 9 against 1). A trim with more in it ("Targa 4S") stays a trim.
  const trimAsBody = spec.trim && /^\s*(coupe|coupé|convertible|cabriolet|cabrio|targa|fastback|roadster|spider|spyder|sedan|wagon|hardtop)\s*$/i.test(String(spec.trim)) ? (bodyFromText(String(spec.trim)) || null) : null;
  if (trimAsBody && !spec.familyInclude && !(refine && refine.body)) {
    refine = { ...(refine || {}), body: trimAsBody, typedBody: true };
    spec.trim = ""; if (spec.titleContains && bodyFromText(String(spec.titleContains)) === trimAsBody) spec.titleContains = null;
    spec.bodyStyle = null;
  } else if (spec.bodyStyle && !spec.familyInclude && !(refine && refine.body)) {
    const bucket = bodyFromText(String(spec.bodyStyle)) || String(spec.bodyStyle).toLowerCase();
    refine = { ...(refine || {}), body: bucket, typedBody: true };
    spec.bodyStyle = null;
  }
  // TRANSMISSION NAMED IN THE QUERY (Part 3 item 1): when the cold query itself names a gearbox
  // ("992 Carrera S manual"), treat it exactly like the answered gearbox refine - skip the gearbox
  // question and scope the pool to that box - instead of re-asking what the seller already told us.
  // The resolver does not lift a transmission word, so detect it here from the raw/search text. A
  // standalone token only (word-bounded), so a model/trim is never mistaken for a gearbox.
  if (!refine || !refine.tx) {
    const txText = `${searchText || ""} ${(vehicle && (vehicle.raw || vehicle.canonicalLabel || vehicle.displayName)) || ""}`;
    if (/\b(manual|stick|gated|\dmt)\b/i.test(txText) && !/\bautomatic\b|\bpdk\b|\bdct\b|tiptronic/i.test(txText)) refine = { ...(refine || {}), tx: "manual", label: "Manual" };
    else if (/\b(pdk|automatic|tiptronic|\bdct\b)\b/i.test(txText)) refine = { ...(refine || {}), tx: "auto", label: /\bpdk\b/i.test(txText) ? "PDK" : "Automatic" };
  }
  // BASE TRIM + MANUAL (bug 2 interaction): a PDK-only base trim (992 Carrera) asked with a manual
  // widens to the manual-capable sibling trims (Carrera S / T) instead of an empty base pool - the
  // honest "the manual Carreras are the S and T" answer. trimsCovered then names them in the eyebrow.
  if (refine && refine.tx === "manual" && spec.subTrimNoManualBase) {
    spec.subTrimInclude = /\bcarrera\s*4?\s*s\b|\bcarrera\s*t\b/i;
    spec.subTrimExclude = null; spec.subTrimName = null;
  }
  // YEAR PINS THE GENERATION (bug 1): whenever a year is given AND a generation is resolved (here, or
  // bound in buildSpec), the year pinned it - so the body/gearbox asks are skipped and the query goes
  // straight to a result. (The generation gate only sets this when IT binds; buildSpec may bind first.)
  // GENERATION BY YEAR AND TRIM (bug 1): correct a year-only generation binding when the named trim
  // crosses generations at a different year than the base car - a 2005 911 Turbo S is a 996, not a 997.
  // Re-scope genCode + the year window to the trim-specific generation, so the pool is that generation's
  // trim only (no 2011 997s in a 996 Turbo S read). Runs before resolvedCar so the label is correct too.
  {
    const mr = mrRulesFor(spec.make, spec.model);
    if (mr && spec.trim && spec.year) {
      const g = mrGenForTrimYear(mr, spec.trim, spec.year);
      if (g && g.code) { spec.genCode = g.code; spec.yearMin = g.yearStart; spec.yearMax = g.yearEnd; spec.genBound = true; }
    }
  }
  // BODY-SPECIFIC GENERATION CODE (bug 2): findGeneration ran before buildSpec detected the body, so map
  // the generation to its body code now (2008 M3 sedan -> E90, coupe -> E92, convertible -> E93).
  if (spec.genCode && spec.bodyStyle) spec.genCode = mrBodyGenCode(spec.make, spec.model, spec.genCode, spec.bodyStyle);
  if (spec.year && spec.genCode) spec.genPinnedByYear = true;
  const now = obNow();
  const iso = days => new Date(now - days * DAY).toISOString();
  const subject = { mileage: vehicle.mileage };   // seller-provided subject mileage (usually absent)
  const ingestDate = await oneBoxIngestDate(env);  // S2-2: freshest online sale, the "ingest current?" signal
  // Resolved-car confirmation line (STEP 3): plain restatement, first thing rendered on
  // EVERY path, so "did it understand my car" is answered before any price appears.
  // 964 OWNERS CALL THE REAR-DRIVE CAR "Carrera 2" (the 964 was sold as Carrera 2 / Carrera 4 to name
  // the driveline; later generations dropped the "2"). Show "Carrera 2" for a 964 base Carrera so the
  // spec label matches what owners say; the pool is already fenced away from the Carrera 4.
  const dispTrim = (String(spec.genCode || "") === "964" && /^carrera(\s*2)?$/i.test(String(spec.trim || "").trim())) ? "Carrera 2" : spec.trim;
  const resolvedCar = {
    year: spec.year, make: spec.make, model: spec.model, trim: dispTrim,
    genCode: spec.genCode || null,   // so the cluster/since lead can name the generation ("E30 M3")
    badge: spec.badge || null,       // a performance badge (S65, M4) names the car itself; the body is redundant ("Most S65s", not "Most S65 sedans")
    // spec.bodyStyle drives pool SCOPING (the detectBodyStyle vocabulary). For DISPLAY (the resolved-car
    // line, the headline, the recent-search chip) fall back to the resolver's Sportbrake so the word a
    // buyer named is not silently dropped from the label ("XF Sportbrake", not "XF"). Scoped to
    // Sportbrake on purpose: it is a distinct model variant the model keyword already scopes the fetch
    // to, so the label and pool agree. A generic body word (hardtop) is NOT surfaced this way - it
    // would not scope the pool and the label would then over-claim.
    bodyStyle: spec.bodyStyle || (/sportbrake/i.test(vehicle.bodyStyle || "") ? "sportbrake" : null),
    transmission: vehicle.transmission || null,
    // FAMILY LABEL (Part 3 item 3): names the pool's family for the freshness line, so it reads "Latest
    // 992 Carrera sale" rather than the bare make-line model "Latest 911 sale". genCode + the resolved
    // trim (or the model when no trim). The frontend freshLine should read familyLabel || model.
    // genCode + trim/model, but DON'T double the word when the genCode already carries it ("3.2 Carrera"
    // + trim "Carrera" -> "3.2 Carrera", not "3.2 Carrera Carrera"; "911SC" + model "911" -> "911SC").
    familyLabel: (function () {
      const gc = spec.genCode ? String(spec.genCode).trim() : "";
      const noun = (dispTrim && String(dispTrim).trim()) ? String(dispTrim).trim() : String(spec.model || "");
      if (gc && noun && new RegExp(noun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(gc)) return gc;   // genCode already names it
      return [gc, noun].filter(Boolean).join(" ").trim() || spec.model;
    })()
  };
  // collectExcluded (Lane B, Oct 15 2026, read-only diagnostics): task=obdiag rows=1 asks the fetch to keep every
  // deduped row the qualifier rejected, with its reason (fetchQualifying). Never set on a product path.
  const diag = { collectExcluded: !!(env && env.collectExcluded) };
  // STAGE MARKS (speed job, Oct 15 2026): wall-clock offsets of the answer's stages, for the timing table
  // (scripts/stageTimes.mjs). Diagnostics only; nothing reads them to decide anything.
  diag.t0 = Date.now(); diag.marks = [];
  const mark = n => { try { diag.marks.push([n, Date.now() - diag.t0]); } catch (e) { /* diagnostics only */ } };
  // QUESTION CAP (Part 3): One Box asks at most TWO questions before a result. `asked` is the running
  // count threaded from the frontend across every chip answer (generation, body, gearbox, Competition).
  // A would-be THIRD split (gearbox / Competition) is not asked - it renders inside the result as two
  // short lines instead (base.inlineSplits). Disambiguation (generation / body) still asks, since no
  // answer can form without it, but it counts toward the two.
  const asked = Math.max(0, Math.min(9, (env && Number(env.asked)) || 0));
  const askCapped = asked >= 2;
  // TWO-QUESTION CAP (Part 3 item 5): once two clarifying questions have been asked, NO third is
  // asked - a would-be third generation/body disambiguation is skipped and the engine answers on the
  // broader family instead, stating what that family covers. familyCoverageNote carries that honest
  // "I widened to the whole {model}" line through to the result (flows via base -> b -> result).
  let familyCoverageNote = null;

  // MODEL FAMILY clarify (item 3): a nameplate with more than one family and NO family named ("Shelby
  // Cobra" or a non-family token like "Shelby Cobra 42") is genuinely several markets. Ask which family
  // with the real choices (289 or 427) instead of pooling every Cobra. One question; chips carry a full
  // re-runnable query. Halo (Daytona) and continuation (CSX) are reached by naming them, not offered.
  if (spec.familyAmbiguous && !askCapped) {
    const g = modelFamilyGroup(spec.make, spec.model);
    if (g) {
      const yearPfx = spec.year ? spec.year + " " : "";
      const asks = (g.askFamilies || []).map(nm => g.families.find(x => x.name === nm)).filter(Boolean);
      const options = asks.map(f => ({ label: f.chip || f.label, query: `${yearPfx}${spec.make} ${spec.model} ${f.chip || f.name}` }));
      const names = asks.map(f => f.chip || f.label);
      const prompt = `The ${g.canonical || spec.model} came as very different cars that price worlds apart. Which is it, the ${names.join(" or the ")}?`;
      return { tier: "generation_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec, prompt, generationOptions: options };
    }
  }

  // GENERATION clarification FIRST (#4): a bare, year-less, trim-less multi-generation nameplate
  // ("911", "Corvette", "Mustang") is genuinely several markets - ASK which generation with
  // year-resolvable chips rather than pooling 1965-2024 into one refusal. Runs before the body
  // ask (generation is the bigger axis) and spares the whole-nameplate fetch. A chassis-code
  // model ("997"), or any year/trim query, skips this and scopes normally.
  // GENERATION GATE (Part 1 Rule 1/3): a curated model consults modelRules - offer only the
  // generations that actually had the resolved body/trim, with UPPERCASE codes and US chip years,
  // in a sentence-case prompt. When a body/trim narrows it to ONE generation, bind that generation
  // silently (so "S-Class Coupe" scopes to the W222 coupe without asking). Uncovered models keep the
  // existing generations.js path verbatim (fallback = today).
  const mrRule = mrRulesFor(spec.make, spec.model);
  if (mrRule && !spec.yearRange && !spec.genCode) {
    let gens = mrRule.generations || [];
    if (spec.bodyStyle) gens = mrGensFor(mrRule, { body: spec.bodyStyle });
    if (spec.trim) gens = mrGensFor({ ...mrRule, generations: gens }, { trim: spec.trim });
    if (spec.year) gens = gens.filter(g => { const r = g.prodYears || g.years; return spec.year >= r[0] && spec.year <= r[1]; });
    const bodyWord = spec.bodyStyle ? " " + mrBodyLabel(mrRule, spec.bodyStyle) : "";
    // YEAR PICKS THE GENERATION (Part 3 bug 1): a year in EXACTLY ONE generation binds it silently (no
    // ask). A year that lands in an OVERLAP (two generations claim it, e.g. 1989 = G-body handover to
    // 964) or NO year still asks. So the ask fires on gens.length>=2 whether or not a year was given.
    if (gens.length >= 2 && !askCapped) {
      const name = mrCanonical(mrRule, spec.model);
      const options = gens.map(g => ({ label: `${g.code} (${g.years[0]}-${g.years[1]})`, query: `${Math.floor((g.years[0] + g.years[1]) / 2)} ${spec.make} ${spec.model}${bodyWord}` }));
      const prompt = spec.year
        ? `A ${spec.year} ${name}${bodyWord} lands on a generation change - the ${gens.map(g => g.code).join(" and ")} both claim it, and they price very differently. Which is it?`
        : `The ${name}${bodyWord} spans generations that price very differently. Which is it?`;
      return { tier: "generation_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec, prompt, generationOptions: options };
    }
    // Capped third ask: answer on the whole model, naming the generations it covers (item 5).
    if (gens.length >= 2 && askCapped) familyCoverageNote = `covering every generation of the ${mrCanonical(mrRule, spec.model)}${bodyWord} (${gens.map(g => g.code).join(", ")})`;
    // Single generation: bind it. genPinnedByYear = the YEAR did the pinning, so the body/gearbox asks
    // below are skipped and the query goes straight to a result (matches /sell, clears the engineCheck
    // OB-choice-vs-SELL-result rows).
    if (gens.length === 1) { spec.yearMin = gens[0].years[0]; spec.yearMax = gens[0].years[1]; spec.genCode = gens[0].code; spec.genBound = true; spec.genPinnedByYear = !!spec.year; }
  // EMERGENCY GUARD (Oct 2026, outage): a NAMED trim with NO YEAR on an uncurated multi-generation
  // model ("Ford Mustang Shelby", "...Shelby GT350") used to skip this ask entirely (the original
  // !spec.trim condition) and fall into assessThin's 3-year, title-unscoped family fetch - which
  // timed out Market Check for a high-volume model where the trim word itself spans eras (the 1965
  // Shelby GT350 and the 2016 Shelby GT350 are different markets). Dropping !spec.trim from this
  // condition when there is no year means ANY ambiguous trim+no-year combo asks the generation
  // question instead of attempting that fetch - a trim/year combo that already resolves to ONE
  // generation is unaffected (gens.length stays 1 below, no ask fires).
  } else if (!mrRule && (!spec.trim || !spec.year) && !spec.yearRange && !spec.genCode) {
    const gens = generationsForModel(spec.make, spec.model);
    let matching = spec.year ? gens.filter(g => spec.year >= g.yearStart && spec.year <= g.yearEnd) : gens;
    // TRIM-ERA NARROWING (item 2, Oct 2026): a named trim that only ever existed in some of this
    // model's generations (Corvette ZR-1: C4 and C6 only) must not offer every generation - same
    // principle as the curated mrGensFor({trim}) filter above, via the small uncurated map in
    // lib/generations.js. Only narrows when the trim resolves to a known entry; an unmapped trim
    // (most of them) falls through to the existing year-only filtering, unchanged.
    if (spec.trim) {
      const codes = trimEraCodes(spec.make, spec.model, spec.trim);
      if (codes) matching = matching.filter(g => codes.includes(g.code));
    }
    if (matching.length >= 2 && !askCapped) {
      const options = matching.map(g => ({ label: `${g.code} (${g.yearStart}-${g.yearEnd})`, query: `${Math.floor((g.yearStart + g.yearEnd) / 2)} ${spec.make} ${spec.model}` }));
      const prompt = spec.year
        ? `A ${spec.year} ${spec.model} lands right on a generation change - the ${matching.map(g => g.code).join(" and ")} both claim it, and they price very differently. Which is it?`
        : `The ${spec.model} spans generations that price very differently. Which is it?`;
      return { tier: "generation_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec, prompt, generationOptions: options };
    }
    // Capped third ask: answer on the whole model, naming the generations it covers (item 5).
    if (matching.length >= 2 && askCapped) familyCoverageNote = `covering the ${matching.map(g => g.code).join(", ")} generations of the ${spec.model}`;
  }

  // RULE 8 (named body not offered by the resolved generation): a "2003 S-Class Coupe" resolves to
  // W220, which was sedan-only (its coupe is the CL). Never build a sedan/CLS range and label it a
  // coupe - say the body does not exist for this car and show the real sales unlabelled.
  if (spec.bodyStyle && mrRule && spec.genCode) {
    const gb = mrBodiesForGen(mrRule, spec.genCode);
    if (gb && gb.length && !gb.some(b => mrBodyEq(b, spec.bodyStyle))) {
      const name = mrCanonical(mrRule, spec.model);
      const bl = mrBodyLabel(mrRule, spec.bodyStyle);
      return { tier: "body_unavailable", resolvedCar, resolvedSpec: spec.resolvedSpec,
        samLine: `The ${spec.genCode} ${name} was not sold as a ${bl}. If you mean a different body or a related model, tell me which and I'll pull the right sales.`,
        referenceFigure: null, referenceFigureReason: "the named body was never sold for this car, so there is no pool to build a figure from" };
    }
  }
  // BODY GATE (Part 1 Rule 1/3): if the seller did not name a body, offer only bodies the resolved
  // generation/trim actually had AND that the pool contains, with the maker's own body names.
  if (!spec.bodyStyle) {
    // modelRules-allowed bodies for the resolved scope (trim locks tightest, then generation).
    let allowed = null;
    if (mrRule) {
      const trimB = spec.trim ? mrBodiesForTrim(mrRule, spec.trim, spec.genCode) : null;
      const genB = spec.genCode ? mrBodiesForGen(mrRule, spec.genCode) : null;
      allowed = trimB || genB || null;
      // A body-locked trim/generation scopes silently, never asks (CSL -> coupe, W220 -> sedan). e58: never when a typed
      // or chip body is already the body (refine.body): the typed word is the body, and a lock from the trim would fence
      // the pool against it ("2012 M3 Competition Coupe" was fenced to sedans).
      if (allowed && allowed.length === 1 && !(refine && refine.body)) { spec.bodyStyle = allowed[0]; spec.bodyLocked = true; }   // e65: a lock, not a typed body (see the body discipline)
    }
    if (!spec.bodyStyle) {
      const bodyProbeSpec = (spec.trim && String(spec.trim).trim() && !spec.badge) ? { ...spec, titleContains: String(spec.trim).trim() } : spec;
      const wide = await fetchQualifying(bodyProbeSpec, iso(730), env, diag);
      // Body classification for a COVERED model uses the maker's OWN body names first (Ferrari GTS ->
      // targa, Berlinetta -> coupe, Spider -> convertible; Jaguar Roadster/FHC), because classifyBody
      // only reads generic body words and a Ferrari/Jaguar body is named by the trim. A sale that
      // still names no body counts as the car's DEFAULT body (sedan for an S-Class, coupe for a 911),
      // so sedan titles ("S550") are not lost. Uncovered models keep classifyBody; a no-body sale is
      // UNSPECIFIED, never dropped. (Body fix, Oct 2026.)
      const FAM = s => { s = String(s || "").toLowerCase(); return ["convertible", "cabriolet", "cabrio", "spyder", "spider", "roadster", "drophead"].includes(s) ? "convertible" : s === "targa" ? "targa" : ["coupe", "berlinetta", "fastback", "fixed head coupe", "fhc"].includes(s) ? "coupe" : ["sedan", "saloon"].includes(s) ? "sedan" : s; };
      const defBody = mrDefaultBody(mrRule, spec.genCode);
      const bn = (mrRule && mrRule.bodyNames) ? Object.entries(mrRule.bodyNames).map(([fam, label]) => [FAM(fam), new RegExp("\\b" + String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i")]) : null;
      const classifyFor = r => {
        const t = String(r.raw_title || r.rtitle || r.title || "");
        if (bn) { for (const [fam, re] of bn) if (re.test(t)) return fam; }
        const cb = titleBodyOf(r); return cb ? FAM(cb) : null;   // title words only (Sam, Oct 15 2026): no stored field, no default body
      };
      const counts = {}, pricesByFam = {}; let unspecified = 0;
      for (const r of wide) { const b = classifyFor(r); if (b) { counts[b] = (counts[b] || 0) + 1; (pricesByFam[b] || (pricesByFam[b] = [])).push(r._usd); } else unspecified++; }
      const bodyTotal = Object.values(counts).reduce((a, c) => a + c, 0) + unspecified;
      let present;
      if (mrRule) {
        // A covered model offers every body FAMILY its generation actually had (Rule 1) with >= an
        // ABSOLUTE floor of real sales - not a share threshold, which a dominant default body (sedan)
        // would use to wrongly suppress a real minority line (the C217 coupe / A217 cabriolet).
        // CHIP ORDER (Oct 2026): the maker's listed order (closed body first), from bodyNames keys.
        const order = Object.keys(mrRule.bodyNames || {}).map(FAM);
        present = Object.keys(counts)
          .filter(fam => counts[fam] >= 5 && (!allowed || allowed.some(a => mrBodyEq(a, fam))))
          .map(fam => ({ style: fam, n: counts[fam], label: mrBodyLabel(mrRule, fam) }))
          .sort((a, z) => { const ia = order.indexOf(a.style), iz = order.indexOf(z.style); return (ia < 0 ? 99 : ia) - (iz < 0 ? 99 : iz); });
      } else {
        // Uncovered model: counts are already keyed by FAMILY, so build one chip per family (never
        // three "Cabriolet/Convertible/Roadster" chips for the one open family). Generic body names.
        const GEN_LABEL = { convertible: "Convertible", coupe: "Coupe", targa: "Targa", sedan: "Sedan", wagon: "Wagon", truck: "Truck" };
        present = Object.keys(counts).filter(fam => counts[fam] >= Math.max(3, bodyTotal * 0.18)).map(fam => ({ style: fam, n: counts[fam], label: GEN_LABEL[fam] || fam }));
      }
      // 90% COVERAGE GATE (body fix): the offered chips must cover >=90% of the pool, else the
      // question would omit the body most owners have - skip it and proceed body-agnostic.
      const coverage = bodyTotal > 0 ? present.reduce((a, p) => a + (p.n || 0), 0) / bodyTotal : 0;
      // MATERIALITY (Round 4 Job 3): the coverage/floor rules above decide which body styles are
      // real enough to NAME; this adds the other half of the ONE shared rule - the two largest
      // present styles must also be clearly apart in price (splitMaterial), same predicate as
      // trim/gearbox/competition. A model whose bodies happen to price the same (a body choice
      // that is cosmetic, not a different market) no longer asks just because both styles exist.
      const topTwoBody = present.slice().sort((a, z) => z.n - a.n).slice(0, 2);
      const bodyMaterial = topTwoBody.length === 2 ? splitMaterial(pricesByFam[topTwoBody[0].style] || [], pricesByFam[topTwoBody[1].style] || []).material : false;
      // Capped third ask (item 5): skip the body question and read every body style, saying so.
      if (present.length >= 2 && coverage >= 0.9 && bodyMaterial && askCapped) familyCoverageNote = `covering every body style (${present.map(p => p.label).join(", ")})`;
      // Year pinned the generation AND a trim is named (bug 1): go STRAIGHT TO A RESULT, don't ask body
      // - a "2008 Carrera S" reads the generation+trim pool (both bodies) like /sell does, clearing the
      // OB-choice-vs-SELL-result engineCheck rows. trimsCovered/the band still describe what is shown.
      if (present.length >= 2 && coverage >= 0.9 && bodyMaterial && !askCapped && !(spec.genPinnedByYear && spec.trim)) {
        // Covered models keep the maker's listed order (set above); uncovered order by sales count.
        if (!mrRule) present.sort((a, z) => z.n - a.n);
        // optionCounts (Round 4 Job 3): a NEW, parallel field only identityQuestionFrom reads -
        // bodyOptions itself is unchanged (any existing frontend consumer of the bare label array
        // is unaffected), this just gives the data-contract layer real per-side counts.
        return { tier: "body_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec, prompt: bodyPrompt(present.map(p => p.label)), bodyOptions: present.map(p => p.label), optionCounts: present.map(p => p.n) };
      }
    }
  }

  // ---- Trim-to-family widening ladder (Sep 2026; resolver-level trim, so both surfaces) ----
  // A named trim scopes the pool (rule 3.8); when it is thin, widen HALO-DOWN-TO-FAMILY only,
  // never base-up-into-the-halo. Steps, each stated to the user: (a) exact trim past 2 years,
  // (b) exact trim past 5 years, (c) family (drop trim) past 2 years with the halo set aside and
  // labelled, (d) family past 5 years, (e) honest thin state showing what there is. A base or
  // unspecified query always sets the halo aside and never widens up.
  // Halo matcher. For a performance-BADGE car (M-car / AMG / RS) the pool is ALREADY the
  // performance car, so the aside must NOT strip the badge's OWN mainstream: an "amg" token
  // matches 100% of a C63 pool (audit) and would empty it. Only variants genuinely ABOVE the
  // badge are set aside - Black Series for AMG; the BMW list (now competition-free) already only
  // holds genuine M-specials. A BASE (non-badge) query keeps the full marque list, so a base
  // Mercedes still sets aside its AMGs and a base Mustang its Shelbys.
  // Intrinsic-AMG (Sep 2026): a model whose NAME already carries the AMG token ("SLS AMG",
  // "AMG GT") IS the AMG, exactly like a resolved badge - the broad /amg/ matcher would shove
  // its ENTIRE pool into the aside and empty exHalo, which surfaced as a false coupe refusal
  // (an SLS AMG with enough online sales to skip thin mode fell through to this base-arm split).
  // Treat it like the badge case: only the genuinely-higher Black Series is the halo.
  const intrinsicAmg = intrinsicAmgFor(spec.make, spec.model, spec.year);
  const haloRe = ((spec.badge || intrinsicAmg) && /mercedes|benz/i.test(spec.make))
    ? /\bblack\s?series\b/i
    : haloMatcherFor(spec.make);
  const trimName = spec.trim && String(spec.trim).trim() ? String(spec.trim).trim() : null;
  const trimRe = trimName ? trimTitleRe(trimName) : null;
  const trimIsHalo = !!(trimName && haloRe && haloRe.test(trimName));
  const base = { resolvedCar, resolvedSpec: spec.resolvedSpec, dedup: diag, vehicle: { make: spec.make, model: spec.model, trim: spec.trim, year: spec.year }, exactSale: (env && env.exactSale) || null,
    // Subject mileage the input already gave (e.g. "964 cabriolet 45k miles"): never re-ask it as
    // the earned question - the "don't ask a field the input already provided" rule (verify case c).
    subjectMileage: Number.isFinite(Number(subject.mileage)) && Number(subject.mileage) > 0 ? Number(subject.mileage) : null,
    // Two-question cap fall-through (item 5): when a third clarify was suppressed, this states what the
    // broader-family answer covers; null on the normal path. Flows through to the rendered result.
    familyCoverageNote,
    inlineSplits: [] };   // capped third splits (gearbox / Competition) rendered as lines, not a question

  // Direction rule: never widen a base pool up into the halo; a named halo trim widens
  // halo-DOWN-to-family with the halo set aside + labelled. Fetches are DB-scoped: the exact
  // trim filters the TITLE at the database (a common nameplate pulls the dozens of trim rows,
  // not the whole family); the family fetch (only on widening / base) is bounded by year/gen.
  const famSpec = { ...spec, perfInclude: null, perfExclude: null, excludeVariants: [] };
  // ONLINE BAND (Sep 2026): when a fetched pool holds three or more online sales, its house sales are held out of the band.
  // e65 (Sam item 5): the held-out house rows are itemised in the diagnosis read ("dropped: house sale, online band"), never silent;
  // keepHouse (diagnosis only) switches the drop off to show the answer with them in.
  const online = rows => {
    const o = rows.filter(r => !isHouseSource(r.source));
    if (o.length < 3 || obKeepHouse()) return rows;
    if (diag && diag.collectExcluded) { diag.excluded = diag.excluded || []; for (const r of rows) if (isHouseSource(r.source)) diag.excluded.push({ row: r, reason: "dropped: house sale, online band (three or more online sales)", fetch: "online band" }); }
    return o;
  };
  const priceUp = rows => rows.filter(r => { r._usd = outcomeUsd(r); return Number.isFinite(r._usd) && r._usd > 0; });
  const fetchPool = async (extra, days) => priceUp(online(await fetchQualifying({ ...famSpec, ...extra }, iso(days), env, diag)));

  // Aside = the make halo (haloRe, badge-aware) OR a non-stock car (race/restomod/period tuner) via
  // the SHARED rule with wantHalo:true, so the tuner/race/restomod categories are added on BOTH
  // surfaces (change #4) WITHOUT re-applying the broad make-halo (which would re-break the
  // intrinsic-AMG/badge scoping). A named-halo query keeps its own halo (trimIsHalo) but still sets
  // aside race/restomod/tuner. Moved above the thin-mode assessment (Round 5 Lane B job, Oct 2026)
  // so the rung 4/5 rescue below can share this SAME halo-aside logic, never a second copy.
  // _tag (Rule 5 guard: CSL, Heritage, Scuderia, 16M, restomod/replica, year-mismatch, ...) is set
  // ASIDE here - kept in the pool, shown separately, OUT of the headline band. _askable (Competition/
  // ZCP) is deliberately NOT aside in this deploy, so it stays in the range until the gearbox/Competition
  // question ships (second deploy); no range silently shrinks in between.
  const isAside = r => !!r._tag || (haloRe && haloRe.test(titleOf(r))) || !!recordExcludeReason(r, spec.make, { wantHalo: true, self: `${spec.model || ""} ${spec.trim || ""}` });
  const part = rows => ({
    halo: rows.filter(isAside),
    exHalo: rows.filter(r => !isAside(r))
  });
  // RUNG 4 + 5 RESCUE (Round 5 Lane B job, Oct 2026, Part 1 rungs "model_any_year" and "sibling").
  // Tried ONLY when the trim/model scope has come up genuinely empty at every year-scoped attempt -
  // same model (trim kept, then trim dropped) at ANY year, then a curated named sibling model
  // (lib/modelRules.js SIBLING_MODELS). Every candidate passes through the SAME fetchPool (fences,
  // trust rules, dedup, the SAME part()/isAside halo split above) and buildResult (provenance/
  // engine-swap/halo set-aside, THIN(3) floor, varied-pool refusal) as every other rung - never a
  // second, looser path. Returns a full buildResult-shaped answer with fallbackRung/rungLabel/
  // siblingName attached, or null if nothing here clears THIN(3) either (the caller falls through
  // to not_tracked / not_enough_data).
  // ONE RESCUE PER ANSWER (Lane B, Oct 14 2026, the 911 R trace): the rescue is reached from two places
  // (the model-any-year upgrade check before buildResult, and the refusal path after it) and used to run
  // its fetches twice. Memoized: the second caller reads the first run's result.
  let rescueOnce = null;
  const anyYearOrSiblingRescue = () => (rescueOnce ||= anyYearOrSiblingRescueRun());
  const anyYearOrSiblingRescueRun = async () => {
    // The named-sibling step (rung 5), as its own function so the trim-dropped model step above it can be
    // skipped (see the generation-bound note below) without losing the sibling.
    const siblingStep = async () => {
      // Named sibling model (same make, a different model entirely) - the last rung before
      // not_enough_data. siblingModelFor (lib/modelRules.js SIBLING_MODELS, Part 1 rung 5) is a
      // DIFFERENT, NEW mechanism from this file's own pre-existing siblingFor/SIBLING_FAMILIES (the
      // thin-tier "badge-twin pointer", e.g. Camaro/Firebird) - that one is an additive display
      // pointer, never a comps source; this one actually supplies the pool when the model itself has
      // none. Keyed on (make, model, trim) since the shared resolver files a trimmed nameplate's MODEL
      // differently from a standalone one (lib/modelRules.js comment on SIBLING_MODELS).
      const sib = siblingModelFor(spec.make, spec.model, spec.trim);
      if (!sib) return null;
      const sibFamSpec = { ...famSpec, model: sib.model, trim: null, titleContains: null, yearMin: null, yearMax: null, badge: null, perfInclude: null, perfExclude: null, excludeVariants: [] };
      // intrinsicAmgFor-aware, same narrowing the outer haloRe already applies (CLK55 AMG's own
      // model name carries "AMG" intrinsically - the broad make-halo would empty its whole pool).
      const sibHaloRe = intrinsicAmgFor(sib.make, sib.model, null) ? /\bblack\s?series\b/i : haloMatcherFor(sib.make);
      const sibIsAside = r => !!r._tag || (sibHaloRe && sibHaloRe.test(titleOf(r))) || !!recordExcludeReason(r, sib.make, { wantHalo: true, self: sib.model });
      const sibRows = priceUp(online(await fetchQualifying(sibFamSpec, iso(1825), env, diag)));
      const sibExHalo = sibRows.filter(r => !sibIsAside(r));
      const sibSpec = { ...spec, make: sib.make, model: sib.model, trim: null, genCode: null, genBound: false, badge: null, perfInclude: null, perfExclude: null };
      const candSib = { rows: sibExHalo, step: "base", windowLabel: "all years on record", aside: null, widening: null };
      await obEnrichExtras(candSib, env, diag);
      const resSib = buildResult(candSib, base, iso, sibSpec, refine);
      if (resSib.tier === "result") {
        const sibYears = sibExHalo.map(r => Number(r.year)).filter(Boolean);
        const decade = sibYears.length ? `${Math.floor(Math.min(...sibYears) / 10) * 10}s` : null;
        const sibCar = { ...resolvedCar, make: sib.make, model: sib.model, trim: null, genCode: null, familyLabel: sib.label };
        return finalStamp({ ...resSib, resolvedCar: sibCar, fallbackRung: "sibling", siblingName: sib.label, rungLabel: `Closest: ${sib.label}${decade ? ", " + decade : ""}` }, { spec, resolvedCar, asked, askCapped, mark, refine });
      }
      return null;
    };
    // FIX 2 (speed job, Oct 15 2026): the any-year rescue reads the car's GENERATION span when one is bound (spec.genBound:
    // the long-hood 911 reads 1964 to 1973, not every 911 ever filed), never the whole nameplate across all years: the
    // unbounded read took 30 to 38 s to return 0 to 3 rows on the 911s. An unmapped model keeps the unbounded read.
    const rescueYears = (spec.genBound && spec.genCode && Number.isFinite(Number(spec.yearMin)) && Number.isFinite(Number(spec.yearMax))) ? { yearMin: spec.yearMin, yearMax: spec.yearMax } : { yearMin: null, yearMax: null };
    if (trimName) {
      const anyYearTrim = part((await fetchPool({ titleContains: trimName, ...rescueYears }, 1825)).filter(r => trimRe.test(titleOf(r))));
      const cand = { rows: anyYearTrim.exHalo, step: "exact_trim_wide", windowLabel: "all years on record", aside: trimIsHalo ? anyYearTrim.halo : null, widening: null };
      await obEnrichExtras(cand, env, diag);
      const res = buildResult(cand, base, iso, spec, refine);
      if (res.tier === "result") return finalStamp({ ...res, fallbackRung: "model_any_year", rungLabel: `${[spec.model, spec.trim].filter(Boolean).join(" ")}, all years` }, { spec, resolvedCar, asked, askCapped, mark, refine });
    }
    // Drop the trim too (or start here if none was named): same model, any year.
    // NAMED TRIM ON A GENERATION-MAPPED NAMEPLATE (Lane B, Oct 13 2026, the "Porsche 911 R" timeout, second
    // half): with the trim dropped and NO year bound, this read every 911 of every generation over five years
    // (tens of thousands of rows, 90 to 130 seconds measured) only for buildResult to refuse the pool as
    // varied, or for the output gate to refuse a silently trim-dropped answer. The ladder's own family rungs
    // already read the model inside its generation for this query; the honest answer for a thin named trim is
    // its own sales. So a named trim's trim-dropped rescue is skipped when the generation is bound, and the
    // walk goes straight to the named sibling. A trim-less query (the S2000, model any year) is unchanged.
    // Tested on the year bound itself, not spec.genBound (which is not set for every bound spec - the
    // 2016 911 R's 991.1, 2012 to 2016, carried yearMin/yearMax but no genBound, and the trace showed
    // the two 15,375-row fetches still running, 117 of 121 seconds).
    // e38 (Oct 14 2026, the sweep's 1967 Ferrari 275 GTB/4 NART Spider went not_tracked): the skip is for a
    // MULTI-GENERATION nameplate only (three or more curated generations: 911, M3, Corvette, Mustang), where
    // "all years" pools several markets, would be refused as varied, and is the fetch that timed the 911 R
    // out. A calendar-bound or single-generation car (275, 9-2X, Integra) still takes the written ladder's
    // rung 4, the model across all years, with the trim dropped and the label saying so.
    if (trimName && Number.isFinite(spec.yearMin) && Number.isFinite(spec.yearMax) && generationsForModel(spec.make, spec.model).length >= 3) {
      const sibOnly = await siblingStep();
      return sibOnly;
    }
    // MODELS THAT BLEND (e40, Oct 15 2026, written ladder section 2): a nameplate whose number covers distinct
    // cars (Ferrari 250, 275, 330, 365, 512, Dodge Viper) never widens into the family - "275, all years" pooled
    // a GTB/4, a GTB Alloy, a GTS and a 365 GT 2+2 behind a NART Spider. Such a car goes to the named sibling
    // or lands thin on its own sales.
    if (blendsAcrossModels(spec)) return await siblingStep();
    let anyYearModel = part(await fetchPool({ titleContains: null, ...rescueYears }, 1825));
    // TITLE-KEYWORD FALLBACK (Round 5 Lane B job, Oct 2026): a multi-word model name the archive
    // files as a loose phrase, not a model-column value (confirmed live: "CLK DTM" - the model
    // column/title phrase ILIKE alone found 0, while a word-based title search for "CLK" AND "DTM"
    // finds the real sales) must not dead-end here. Same shared titleKeywordPool the trim path
    // above already uses for exactly this reason - one mechanism, not a second copy. Only tried
    // when the phrase match came up thin; the union is deduped by id.
    if (anyYearModel.exHalo.length < 3 && /\s/.test(String(spec.model || ""))) {
      const kw = await titleKeywordPool({ make: spec.make, model: spec.model, year: null, bodyStyle: spec.bodyStyle }, env, DISPLAY_FLOOR).catch(() => null);
      const kwRows = ((kw && kw.pool) || []).map(r => ({ ...r, _usd: r._hv, _hammer: r._hv, _allin: r._hv, currency: "USD", transmission: null }));
      if (kwRows.length) {
        const seen = new Set(anyYearModel.exHalo.map(r => r.id));
        const merged = part([...anyYearModel.exHalo, ...anyYearModel.halo, ...kwRows.filter(r => !seen.has(r.id))]);
        anyYearModel = merged;
      }
    }
    const modelSpec = trimName ? { ...spec, trim: null, genCode: null } : spec;
    const candModel = { rows: anyYearModel.exHalo, step: "base", windowLabel: "all years on record", aside: (anyYearModel.halo && anyYearModel.halo.length) ? anyYearModel.halo : null, widening: null };
    await obEnrichExtras(candModel, env, diag);
    const resModel = buildResult(candModel, base, iso, modelSpec, refine);
    if (resModel.tier === "result") {
      const widenedCar = trimName ? { ...resolvedCar, trim: null, familyLabel: resolvedCar.genCode ? resolvedCar.genCode : spec.model } : resolvedCar;
      return finalStamp({ ...resModel, resolvedCar: widenedCar, fallbackRung: "model_any_year", rungLabel: `${spec.model}, all years` }, { spec, resolvedCar, asked, askCapped, mark, refine });
    }
    return siblingStep();
  };
  // ---- THIN MODE branch: too few online sales for a volume cluster. Fires on data (online <
  // 15 / 36mo), house presence NOT required. A HOUSE STEER layers on when house share >= 2/3.
  // Uses the exact resolved trim scope; houses admitted as evidence. See assessThin.
  // setAsideHalo unless the TRIM itself is the halo: a plain trim (LP640) or base query must not let
  // a special edition (a Murcielago Versace / SV) lead its pool; a halo-trim query (GT3, SV) keeps it.
  const thin = await assessThin(famSpec, trimName, trimRe, iso, env, diag, { setAsideHalo: !trimIsHalo });
  mark("thin_checked");
  base.htMeta = thin; // diagnostics: carried on the non-firing result/refusal too
  if (thin && thin.isThin && refine && refine.variant) {
    // A VARIANT CHIP ON A THIN POOL (e48, item 11): the thin pool itself is narrowed to the chip's side of the variant
    // market (a house pool has no ladder to walk; its five-year window is already the widest read); nothing left
    // is nothing on record for that variant, said so.
    const pv = (spec.variantMarkets || []).find(v => v.key === refine.variant || v.nonKey === refine.variant) || null;
    const standard = refine.variant === "standard";
    if (pv || standard) {
      const keep = r => { const t = String(r.raw_title || r.rtitle || ""); if (standard) return !(spec.variantMarkets || []).some(v => !v.generic && v.re.test(t)); return refine.variant === pv.key ? pv.re.test(t) : !pv.re.test(t); };
      const held = (thin.rawPool || []).filter(r => !keep(r));
      thin.rawPool = (thin.rawPool || []).filter(keep); thin.cards = shapeCards(thin.rawPool); thin.receipts = (thin.receipts || []).filter(x => keep(x)); thin.totalN = thin.rawPool.length;
      const hammers = thin.rawPool.map(r => Number(r._hammer)).filter(h => Number.isFinite(h) && h > 0).sort((a, b) => a - b);
      thin.span = (hammers.length >= 2 && hammers[hammers.length - 1] > hammers[0]) ? [roundFloor(hammers[0]), roundCeil(hammers[hammers.length - 1])] : null;
      thin.variantAsides = []; thin.variantOptionsLine = thin.variantOptionsLine || [];
      thin.setAsideRows = (thin.setAsideRows || []).concat(shapeCards(withUsd(held)).map(c => ({ ...c, reason: pv && refine.variant === pv.key ? pv.base : (pv ? pv.label : "other variant"), setAside: true })));
      if (!thin.rawPool.length && pv) {
        // e51: either side of the variant market, in that side's own words.
        const nm = [spec.year, spec.make, spec.model, spec.trim].filter(Boolean).join(" ");
        const side = refine.variant === pv.key ? pv.label : pv.base;
        return { tier: "not_tracked", dedup: diag, resolvedCar: { ...resolvedCar, applied: { variant: refine.variant } }, resolvedSpec: spec.resolvedSpec, samLine: `No ${side} ${nm} sale on record in the last five years.`, referenceFigure: null, referenceFigureReason: "no sales on record for this variant", rungLabel: `${[spec.model, spec.trim].filter(Boolean).join(" ")} ${cap(pv.label)}`, fallbackRung: "not_enough_data", cards: [], rawPool: [], setAsideRows: [], qualifyingTotal: 0 };
      }
    }
  }
  if (thin && thin.isThin) {
    await attachSibling(thin, spec, env);   // additive: a badge-twin pointer when the queried car is thin
    // cards at the top level (not just buried in d.thin.cards): a thin-tier result used to carry NO
    // top-level cards at all, so a consumer reading d.cards directly for a "last three" style summary
    // got nothing (or, worse, kept whatever a prior different-trim/body query had left behind) instead
    // of this car's own thin pool. recent3 is the same pool, deduped to distinct cars, newest first.
    // fallbackRung/rungLabel (Round 5 Lane B job): this IS the queried car's own cohort (same rung
    // family as "exact"/"year_widened"/"generation" below), just too online-thin for a computed
    // range - never "not_enough_data" (that is reserved for the genuinely empty-pool terminal rung).
    const thinRung = (spec.genBound && spec.genCode) ? "generation" : (spec.year ? "year_widened" : "exact");
    // LABEL TRUTHFULNESS (Part 2 rule a): the thin pool's own window (36mo, assessThin) routinely
    // spans more than the single asked year even when no generation is bound - a bare year label
    // ("2005") on a widened rung was stating less than the pool actually covers (confirmed live,
    // "2005 Mercedes-Benz CLK DTM": pool spans 2003-2007, label said only "2005"). poolYearSpan
    // returns null when every row IS the one asked year, so an un-widened thin pool is unaffected.
    const thinNameplate = [spec.model, spec.trim].filter(Boolean).join(" ");
    const thinSpan = poolYearSpan(thin.rawPool);
    // The thin label describes the pool's own years too (e38, Oct 14 2026, the sweep's 1989 911 Turbo Targa):
    // "(930 generation)" only when the thin receipts reach both ends of the generation, else the years they hold.
    const thinYs = (thin.rawPool || []).map(r => Number(r.year)).filter(Number.isFinite);
    const thinSpansGen = !!(spec.genBound && spec.genCode && thinYs.length && Math.min(...thinYs) <= spec.yearMin && Math.max(...thinYs) >= spec.yearMax);
    const thinLabel = thinSpansGen ? `${thinNameplate} (${spec.genCode} generation)`
      : thinSpan ? `${thinNameplate}, ${thinSpan[0]} to ${thinSpan[1]}`
      : [spec.year, spec.model, spec.trim].filter(Boolean).join(" ");
    {
      // Part 5/6 (Oct 2026): the SAME thin pool, normalized to the _usd field contextRoles/strip
      // read (thin rows carry _allin, not _usd - withUsd, already defined above, is the ONE place
      // that normalizes this, never a second copy).
      const thinPriced = withUsd(thin.rawPool || []);
      const thinScopeLabel = thinLabel + bodyMixSuffix(spec, thin.rawPool) + variantSuffixAll({ variantAsides: thin.variantAsides || (thin.variantAside ? [thin.variantAside] : []) });
      return finalStamp({   // e62: thin answers carry the latest-sale line and the exact lowest and highest as DATA (no card prints them as a range)
        tier: "thin", ...base, thin, thinReason: thinReasonFor(thin, (thin.rawPool || []).length), thinLine: THIN_LINES[thinReasonFor(thin, (thin.rawPool || []).length)], span: thin.span || undefined, refine, cards: thin.cards || [], rawPool: thin.rawPool || [], recent3: lastThreeDistinct(thin.cards), freshness: obFreshness(!!thin.houseSteer, obNewestDate(thin.receipts), ingestDate, now), referenceFigure: null, referenceFigureReason: "too few online sales for a volume range, so there is no typical band to build a figure from", fallbackRung: thinRung, rungLabel: thinScopeLabel,
        scopeLabel: thinScopeLabel, liveScope: `Comparing live listings to ${thinScopeLabel}.`,
        contextRoles: contextRolesFor(thinPriced, null, false),
        identityQuestion: null, trend: null, distribution: null,
        strip: stripFor(thinPriced),
        ownSales: ownSalesFor(vehicle, thin.cards || [], [], null),
        genYears: (spec.genBound && spec.genCode) ? [spec.yearMin, spec.yearMax] : null,
        variantAsides: thin.variantAsides || [], variantOptionsLine: Array.isArray(thin.variantOptionsLine) && thin.variantOptionsLine.length ? thin.variantOptionsLine : null,
        setAsideRows: thin.setAsideRows || [], setAsideCount: (thin.setAsideRows || []).length, qualifyingTotal: (thin.rawPool || []).length + (thin.setAsideRows || []).length,
        ...windowFactsFor(thin.rawPool || [], false)
      }, { spec, resolvedCar, asked, askCapped, mark, refine });
    }
  }
  // RUNG 4/5 (Round 5 Lane B job, Oct 2026): the exact-model pool is EMPTY over 36 months (a genuine
  // one-off, thin.totalN===0). Try same-model-any-year, then a named sibling, via the SAME rescue
  // the main chosen-ladder falls back to below - ONE mechanism, not a second path. The make-era
  // class-era rung (classEraGuarded/assessClassEra) is DELETED per this round's brief: it answered
  // from OTHER CARS (the wider marque/era population), never this car's own cohort, and every
  // caller now reads this same rescue instead of a second, era-banded fallback.
  if (thin && thin.totalN === 0) {
    const rescued = await anyYearOrSiblingRescue();
    if (rescued) return rescued;
  }
  // NOT TRACKED (issue 2): make + model are resolved (we can NAME the car) but there is not a single
  // sale on file anywhere - not at the exact scope, not at any year, not even a named sibling - so
  // say so honestly, never the generic "what year, make and model" ask. Fires only when every rung
  // above (including the rung 4/5 rescue) found genuinely nothing.
  // READ FAILED (e41, Sam's Job 1a): an archive read that did not complete (a timeout or throttle, diag.queryError)
  // leaves an empty pool that used to read as "We haven't tracked a ... sale yet" - a bare year and model must
  // always get a question or a pool, never nothing dressed as a fact. Said for what it is; never cached.
  if (thin && thin.totalN === 0 && spec.make && spec.model && diag && diag.queryError) {
    return { tier: "read_failed", resolvedCar, resolvedSpec: spec.resolvedSpec, samLine: "The archive read did not finish. Try the search again in a moment.", referenceFigure: null, referenceFigureReason: "the archive read did not complete", rungLabel: null, fallbackRung: null, cards: [], rawPool: [] };
  }
  if (thin && thin.totalN === 0 && spec.make && spec.model) {
    const name = [spec.make, spec.model, spec.trim].filter(Boolean).join(" ");
    return { tier: "not_tracked", dedup: diag, resolvedCar, resolvedSpec: spec.resolvedSpec, samLine: `We haven’t tracked a ${name} sale yet. When one sells, it’ll show up here.`, referenceFigure: null, referenceFigureReason: "no sales on record for this car at all", rungLabel: name };
  }

  const EXACT_MIN = 5;
  // RUNG 1 pre-check (Round 5 Lane B job, Oct 2026, Part 1): try the car's OWN model year ALONE,
  // before ever reading the wider +/-2 (or generation) window buildSpec already set as this ladder's
  // ceiling (spec.yearMin/yearMax). This is the actual fix for "2025 Porsche 911 answers from
  // 2024/2026 Carrera/Carrera S sales without ever saying so" - today's very first fetch already
  // reads the wide window, so the exact year never got a chance to stand alone. Gated on THIN(3)
  // solid (buildPool, via solidCountFor), the SAME floor Sam's brief names, not the EXACT_MIN/
  // presentable() ratio gate below (which governs the PRE-EXISTING +/-2-vs-5yr escalation,
  // unchanged). Only attempted when a year is known and narrower than the already-set ceiling;
  // skipped entirely for a year-less query (nothing narrower exists) - falls through to the
  // existing logic untouched in both cases, so every existing fence (blend/keyword/family) still
  // governs exactly as before whenever this pre-check does not itself succeed.
  // THE CHIP NEVER WIDENS (e43, Sam's Job 1b): the walk's threshold and the rescues read the pool WITHOUT the body
  // or trim refine, so the page a body option opens stays on the bare page's rung and years (the option's count
  // is the rows it holds there); the refine narrows the finished pool afterwards (buildPool). On the e42 proof a
  // "Convertible (3)" option on the 1969 Camaro had opened a 1968 to 1969 page of 9, and "Convertible (1)" on the
  // 2018 Mustang GT had rescued to "Mustang GT, all years" (86).
  const refineForWalk = refine ? { ...refine, body: null, trim: null } : refine;
  const solidCountFor = (rows, step) => buildPool({ rows, step, windowLabel: "", widening: null }, base, iso, spec, refineForWalk).solid.length;
  // ONE YEAR AT A TIME (Lane B job, Oct 2026, Part 4; RE-RESTORED Part 3 golden-cars job): the
  // year_widened rung widens by exactly one year each side, checking RANGE_THRESHOLD after every
  // step, bounded by the generation (spec.yearMin/yearMax - the generation's own bound, or the +/-2
  // calendar fallback when none is curated) - never jumping straight to the full bound the moment
  // the exact year alone comes up short. Confirmed live: a bare "2025 Porsche 911" used to jump
  // straight to the full 992 window (2020 to 2026, 42 sales) the instant 2025 alone was thin,
  // skipping the 12-sale 2024-to-2026 band one step out that already clears RANGE_THRESHOLD on its
  // own (docs/golden-rules.md car 1). Returns the FIRST span that clears RANGE_THRESHOLD, or the
  // widest attempted (the full bound) when none do, same undecided-result contract as yearCandidate
  // below - the caller decides what to do with a sub-threshold return.
  // ONE QUERY, EXACT YEAR THROUGH FULL BOUND: walks every span from the exact year itself out to
  // the full generation/calendar bound, checking RANGE_THRESHOLD after each one-year-wider step, but
  // from a SINGLE fetch, sliced by year in memory - never a fetch per step.
  // REVERT HISTORY (shipped dbb97e5/908223e/20a2c5e, reverted 3b6ca4b, Oct 13 2026, URGENT): both
  // measured-regression cars ("1995 Porsche 911 Carrera", "1969 Chevrolet Camaro") were still over
  // budget live post-fix - but the actual cost driver (a wide-generation fetch's row count on the
  // FIRST compute of a spec) is now absorbed by the Part 1 write-through warm cache: a miss now
  // writes its answer back under the current ENGINE_VERSION, and scripts/postDeployWarm.mjs pays
  // that one-time cost for every golden car right after a version bump reaches production, before
  // the speed check ever runs. The widen behavior was never the thing that needed to get faster;
  // the first-compute-per-spec cost needed to stop recurring on every load, which Part 1 now does.
  const walkYears = async (extra, classify, step) => {
    if (!spec.year) return null;
    if (!Number.isFinite(spec.yearMin) || !Number.isFinite(spec.yearMax) || (spec.yearMin === spec.year && spec.yearMax === spec.year)) {
      const { rows, aside } = classify(await fetchPool({ ...extra, yearMin: spec.year, yearMax: spec.year }, 1825));
      return { rows, aside, solidN: solidCountFor(rows, step), widened: false };
    }
    const full = await fetchPool({ ...extra, yearMin: spec.yearMin, yearMax: spec.yearMax }, 1825);
    let widest = null;
    for (let half = 0; ; half++) {
      const lo = Math.max(spec.yearMin, spec.year - half), hi = Math.min(spec.yearMax, spec.year + half);
      const { rows, aside } = classify(full.filter(r => { const y = Number(r.year); return Number.isFinite(y) && y >= lo && y <= hi; }));
      const n = solidCountFor(rows, step);
      widest = { rows, aside, solidN: n, widened: half > 0 };
      if (n >= RANGE_THRESHOLD || (lo <= spec.yearMin && hi >= spec.yearMax)) return widest;
    }
  };
  let chosen;
  let yearRungExact = false;
  // RANGE-FIRST STOP RULE (Lane B job, Oct 2026, Part 1): the exact-model-year span only COMMITS when
  // it alone already clears RANGE_THRESHOLD (a real range can be shown) - gating on THIN(3) stopped
  // the ladder the moment ANY sales existed, so a brand-new model year with 3 sales answered from a
  // 3-sale pool instead of ever trying the wider window that might hold a real range. yearCandidate is
  // kept (never discarded) even when every span misses RANGE_THRESHOLD, so the post-ladder rescue
  // below can still fall back to it if the WIDER window turns out even thinner - "use the rung with
  // the most sales that still keeps the car's identity" never silently loses sales just because the
  // walk widened past them.
  let yearCandidate = null;
  if (trimName && spec.year) {
    const walked = await walkYears({ titleContains: trimName }, rows => ({ rows: rows.filter(r => trimRe.test(titleOf(r))) }), "exact_trim");
    if (walked) {
      const windowLabel = walked.widened ? "widened years" : "the model year itself";
      if (walked.solidN >= RANGE_THRESHOLD) { chosen = { rows: walked.rows, step: "exact_trim", windowLabel, widening: null }; if (!walked.widened) yearRungExact = true; }
      else yearCandidate = { rows: walked.rows, step: "exact_trim", windowLabel, widening: null, solidN: walked.solidN };
    }
  }
  if (trimName && !chosen) {
    const trim24 = (await fetchPool({ titleContains: trimName }, 730)).filter(r => trimRe.test(titleOf(r)));
    if (presentable(trim24, EXACT_MIN)) chosen = { rows: trim24, step: "exact_trim", windowLabel: "past 2 years", widening: null };
    else {
      const trim5 = (await fetchPool({ titleContains: trimName }, 1825)).filter(r => trimRe.test(titleOf(r)));
      if (presentable(trim5, EXACT_MIN)) chosen = { rows: trim5, step: "exact_trim_wide", windowLabel: "past 5 years", widening: `Only a few ${trimName} sold in the last two years, so this reads the past five.` };
      else if (blendsAcrossModels(spec)) {
        // Fence (#2): dropping the trim here would blend distinct models sharing this nameplate.
        // Stay on the trim's own sales - buildResult renders span-without-cluster if 4+, else refuses.
        chosen = { rows: trim5.length ? trim5 : trim24, step: "exact_trim_wide", windowLabel: "past 5 years", widening: null };
      }
      else {
        // TITLE-KEYWORD route (ONE ENGINE RULE, Oct 2026): a named trim that is thin on the strict,
        // word-ORDER SQL pre-filter (trimIlike) must NEVER silently widen straight to the plain
        // model's range - real sales are routinely missed by that filter alone (a "1966 Shelby
        // Mustang GT350" title has the trim words out of order; a "1965 Ford GT350 Fastback" never
        // spells "Shelby" at all). Before dropping the trim, call the SAME shared titleKeywordPool
        // (lib/_classify.js) /sell's and the new Sell's classEraGuarded already call for their own
        // last-resort keyword route, passing the trim text as the search words - one pool, not a
        // second inline copy. Its SQL fetch is title-filtered at the database (ilike on the trim
        // words), never a blind unscoped family fetch, so it is safe to try even with no year - the
        // Mustang timeout this session was the fetchPool({},730/1825) FAMILY fallback below, which
        // this keyword call never reaches when it succeeds on its own.
        // A one-letter trim ("R") searches as "911 R", never as the bare letter (Lane B, Oct 13 2026, the 911 R
        // timeout): the in-memory word test already required the model word on every kept title, so the pool is
        // the same; only the query stops reading every title in the marque that contains that letter.
        const kwWords = /^[a-z0-9]$/i.test(trimName) && spec.model ? `${String(spec.model).trim()} ${trimName}` : trimName;
        const kw = await titleKeywordPool({ make: spec.make, model: kwWords, year: spec.year, bodyStyle: spec.bodyStyle }, env, DISPLAY_FLOOR).catch(() => null);
        const kwRows = ((kw && kw.pool) || []).map(r => ({ ...r, _usd: r._hv, _hammer: r._hv, _allin: r._hv, currency: "USD", transmission: null }));
        const askNarrow = { detail: "trim", question: `I don't have enough ${trimName} sales on their own for a trim-specific range, so this reads ${spec.model} overall. The exact trim or a VIN would narrow it.` };
        // step "thin" is a pre-existing sentinel elsewhere in this function (chosen.step === "thin"
        // forces a hard REFUSAL regardless of count) - never reuse that name here. A 3-4 keyword
        // match that fails `presentable`'s ratio/count gate still deserves the honest few-sales
        // state (the normal 3-7 "thin bucket" render further down, decided by solid.length, not by
        // this step name), so it gets the SAME step as a clean keyword hit.
        if (kwRows.length >= 3) {
          chosen = { rows: kwRows, step: "exact_trim_keyword", windowLabel: "past 3 years", widening: `Found by a broader title search for "${trimName}", since the usual word-order match alone was too thin.` };
        } else if (!spec.year) {
          // EMERGENCY GUARD (same day, outage) kept as a backstop: with no year, nothing bounds how
          // many eras the FAMILY fallback below can span for a high-volume model - the keyword call
          // above is safe without a year (title-filtered), but these plain fetchPool({},N) family
          // calls are not, so a thin keyword result with no year asks for it instead of attempting them.
          chosen = {
            rows: [], step: "thin", windowLabel: "past 5 years", widening: null,
            askNarrow: { detail: "year", question: `${trimName} spans very different eras for ${spec.make} ${spec.model} - which year, or around when?` }
          };
        } else {
          const p24 = part(await fetchPool({}, 730));
          if (presentable(p24.exHalo, 4)) chosen = { rows: p24.exHalo, step: "family", windowLabel: "past 2 years", aside: trimIsHalo ? p24.halo : null, widening: familyWideningSentence(wideningTrimLabel(spec.model, trimName), spec.model, trimIsHalo), askNarrow };
          else {
            const p5 = part(await fetchPool({}, 1825));
            if (presentable(p5.exHalo, 4)) chosen = { rows: p5.exHalo, step: "family_wide", windowLabel: "past 5 years", aside: trimIsHalo ? p5.halo : null, widening: familyWideningSentence(wideningTrimLabel(spec.model, trimName), spec.model, trimIsHalo), askNarrow };
            else chosen = { rows: (kwRows.length ? kwRows : (p5.exHalo.length ? p5.exHalo : [])), step: "thin", windowLabel: "past 5 years", widening: null };
          }
        }
      }
    }
  }
  // Base (no-trim) arm's own year walk, same rationale and same ONE-fetch mechanism as the trim arm
  // above (a bare "2025 Porsche 911" must get a real chance at ITS OWN model year before reading the
  // wider +/-2/generation ceiling).
  if (!trimName && spec.year) {
    const walked = await walkYears({}, rows => { const p = part(rows); return { rows: p.exHalo, aside: (p.halo && p.halo.length) ? p.halo : null }; }, "base");
    if (walked) {
      const windowLabel = walked.widened ? "widened years" : "the model year itself";
      if (walked.solidN >= RANGE_THRESHOLD) { chosen = { rows: walked.rows, step: "base", windowLabel, widening: null, aside: walked.aside, forceVaried: blendsAcrossModels(spec) }; if (!walked.widened) yearRungExact = true; }
      else yearCandidate = { rows: walked.rows, step: "base", windowLabel, aside: walked.aside, widening: null, forceVaried: blendsAcrossModels(spec), solidN: walked.solidN };
    }
  }
  if (!trimName && !chosen) {
    const p24 = part(await fetchPool({}, 730));
    // Base (no-trim) arm of the #2 fence: a bare blend-nameplate ("250 GT", "Viper") names
    // distinct models under one token, so it must never render a computed span/cluster - route
    // to the varied refusal even if a body-scoped subset reads low-ratio. Distinct from the
    // ratio-based varied guard, which only fires when the pool happens to be wide enough.
    chosen = { rows: p24.exHalo, step: "base", windowLabel: "past 2 years", aside: (p24.halo && p24.halo.length) ? p24.halo : null, widening: null, forceVaried: blendsAcrossModels(spec) };
  }
  // RANGE-FIRST RESCUE (Lane B job, Oct 2026, Part 1): neither pre-check committed (both arms above
  // leave yearRungExact false whenever the exact year alone didn't clear RANGE_THRESHOLD), so `chosen`
  // is whatever the existing year_widened/generation/family ladder landed on. If THAT also falls short
  // of RANGE_THRESHOLD, prefer whichever cohort - the pinned year or the wider window - actually holds
  // more solid sales, never silently preferring the wider one just because it widened later. Both sides
  // already passed the identical halo/blend/trim fences (buildPool, via solidCountFor), so this never
  // crosses a fence boundary the rest of the ladder would not also cross.
  if (!yearRungExact && yearCandidate && chosen.step !== "thin") {
    const chosenSolidN = solidCountFor(chosen.rows, chosen.step);
    if (chosenSolidN < RANGE_THRESHOLD && yearCandidate.solidN > chosenSolidN) { chosen = yearCandidate; yearRungExact = true; }
  }
  // MODEL-ANY-YEAR UPGRADE (Part 3 golden-cars job, Oct 2026): the per-year walk above (walkYears)
  // widens one year at a time up to its full bound (the generation, or the +/-2 calendar fallback)
  // and can still land under RANGE_THRESHOLD there - docs/golden-rules.md car 18, the 2011 Honda
  // S2000: no sale in 2009-2013 reaches even 8, only 7 across the widened years, but the model's
  // WHOLE run (every year on record) does. Reuses anyYearOrSiblingRescue, the SAME mechanism the
  // thin/refusal paths below already call - never a second ladder. Only tried when the per-year walk
  // itself is the limiting rung (chosen.step is "exact_trim" or "base", the two steps walkYears
  // produces) and only TAKES the rescue when it actually reaches a real cluster (cluster truthy means
  // its own solid pool cleared RANGE_THRESHOLD) - a rescue that is itself still under threshold is no
  // improvement, so the narrower, honest widened-years answer stands.
  // A body or trim chip never widens (e44): the rescues below are for the bare query only.
  const chipApplied = !!(refine && (refine.body || refine.trim || refine.variant));
  if (!chipApplied && !yearRungExact && (chosen.step === "exact_trim" || chosen.step === "base") && solidCountFor(chosen.rows, chosen.step) < RANGE_THRESHOLD) {
    const upgraded = await anyYearOrSiblingRescue();
    if (upgraded && upgraded.fallbackRung === "model_any_year" && upgraded.cluster) return upgraded;
  }
  base.platformsCount = new Set(chosen.rows.map(r => platformName(r.source)).filter(Boolean)).size;
  // POOL (job 3, pool-consistency root cause, Oct 2026): computed ONCE here via the SAME buildPool
  // buildResult itself calls below - every split/question decision in this block now reads the
  // fenced, today-first-windowed `solid` pool, never the raw ladder rows (`chosen.rows`). Before this
  // fix the gearbox/competition splits read `chosen.rows` directly - the pre-fence, pre-window pool -
  // while the headline (buildResult, below) applied the full fence/window/set-aside chain to the SAME
  // starting rows and landed on a smaller, different pool. Confirmed live: a 2005 BMW M3 Coupe
  // headline read 87 sales while its gearbox split read 131 manual + 16 SMG = 147 from the unfenced
  // pool. buildPool is a pure function of (chosen, spec, iso, refine), so computing it here and again
  // inside buildResult (same inputs) is safe and yields IDENTICAL results by construction - not a
  // patch that happens to agree today. Skipped on a thin ladder step (buildPool assumes a real pool).
  const headlinePool = chosen.step !== "thin" ? buildPool(chosen, base, iso, spec, refine) : null;
  const splitRows = headlinePool ? headlinePool.solid : chosen.rows;
  // VARIANT MARKET (Sam's Job 4, Oct 15 2026): when this nameplate has a variant the ladder treats as a
  // separate market (lib/modelRules.js VARIANT_MARKETS: engine families, GT and competition versions) and
  // the pool holds it, split by the LISTING'S OWN words. Both sides eight or more and middle points 25
  // percent or more apart: ask "Which {car}?" with counts (the same chip shape as the generation question,
  // chips carry refine.variant). Fewer variant sales: they are set aside (never in the range) and the scope
  // line says what the range is and what was set aside. Never on a thin step, never when the typed words
  // already name the variant, never after the chip answered.
  // e47 (Sam's items 9 and 11): every entry in turn (the nameplate's own variant first, the generic restoration entry
  // last). The identity line offers both sides of every entry even when one side has no sale in the window
  // (variantOptionsLine); a restoration entry sets aside the SMALLER side; the chip answers never re-enter here.
  const vmAll = (spec.variantMarkets || []).filter(vm => !(spec.askedVariantKeys || []).includes(vm.key));
  if (vmAll.length && !(refine && refine.variant) && chosen.step !== "thin" && splitRows.length) {
    base.variantAsides = []; base.variantOptionsLine = [];
    let remaining = splitRows.slice();
    for (const vm of vmAll) {
      const varRows = remaining.filter(r => vm.re.test(titleOf(r))), stdRows = remaining.filter(r => !vm.re.test(titleOf(r)));
      const med = a => a.length ? percentile(a.map(r => r._usd).filter(v => Number.isFinite(v) && v > 0), 0.5) : null;
      const mv = med(varRows), ms = med(stdRows);
      const apart = mv != null && ms != null && Math.abs(mv - ms) / Math.min(mv, ms) >= 0.25;
      const stdKey = vm.nonKey || "standard";
      // ZERO-COUNT OPTIONS ARE NEVER SHOWN (e51, Sam's decision): the option line exists only when BOTH sides have
      // sales under the variant rule (eight or more each, medians 25 percent apart); restoration is never an option
      // or a question (it stays a set-aside reason, below). Otherwise there is no option line at all.
      const bothSides = varRows.length >= RANGE_THRESHOLD && stdRows.length >= RANGE_THRESHOLD && apart;
      if (bothSides && !vm.generic) base.variantOptionsLine.push({ key: vm.key, options: [
        { value: stdKey, label: cap(vm.base), n: stdRows.length, refine: { variant: stdKey } },
        { value: vm.key, label: cap(vm.label), n: varRows.length, refine: { variant: vm.key } }
      ] });
      if (bothSides && !vm.generic && !askCapped) {
        const name = [spec.year, spec.model, spec.trim].filter(Boolean).join(" ");
        return {
          tier: "variant_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec,
          prompt: `Which ${name}? The ${vm.label} cars and the ${vm.base} cars sell in different markets.`,
          variantKey: vm.key,
          variantOptions: [`${cap(vm.base)} (${stdRows.length} ${stdRows.length === 1 ? "sale" : "sales"})`, `${cap(vm.label)} (${varRows.length} ${varRows.length === 1 ? "sale" : "sales"})`],   // e65: singular for one
          optionCounts: [stdRows.length, varRows.length],
          variantChoices: [
            { key: stdKey, label: `${cap(vm.base)} cars`, count: stdRows.length, query: searchText, refine: { variant: stdKey } },
            { key: vm.key, label: `${cap(vm.label)} cars`, count: varRows.length, query: searchText, refine: { variant: vm.key } }
          ]
        };
      }
      // Set aside: the variant side, or for a smaller-side entry (restoration) whichever side is smaller; named.
      const asideVariant = vm.smallerSide ? (varRows.length <= stdRows.length) : true;
      const asideRows = asideVariant ? varRows : stdRows;
      const asideLabel = asideVariant ? vm.label : vm.base, keptLabel = asideVariant ? vm.base : vm.label;
      if (asideRows.length && (!vm.smallerSide || asideRows.length < remaining.length)) {
        for (const r of asideRows) if (!r._tag) r._tag = `variant:${asideLabel}`;
        remaining = remaining.filter(r => !asideRows.includes(r));
        base.variantAsides.push({ key: vm.key, label: asideLabel, base: keptLabel, n: asideRows.length, generic: !!vm.generic });
      } else if (!vm.generic) {
        base.variantAsides.push({ key: vm.key, label: vm.label, base: vm.base, n: 0, generic: false });   // the scope line still says which variant the range is
      }
    }
    base.variantAside = base.variantAsides.find(x => !x.generic) || null;
    if (!base.variantOptionsLine.length) base.variantOptionsLine = null;   // no option line at all (e51)
  }
  // GEARBOX QUESTION (Part 1 Rule 2, materiality unified Round 4 Job 3): after generation + body,
  // when the generation offered BOTH a manual and a non-manual box, ask it before the range (the
  // manual vs F1/PDK/SMG gap moves price) - gated by the ONE shared splitMaterial predicate
  // (SPLIT_MIN(3) each side + medians clearly apart), replacing the old hardcoded 5/5 count-only
  // floor. gearboxType counts only positive markers, so unknown "N-speed" cars count on neither
  // side; the question never fires for a single-gearbox car (a 458's whole pool is auto/unknown).
  // The chip answer re-scopes via refine.tx. Never on a thin pool.
  if (mrRule && !(refine && refine.tx) && chosen.step !== "thin" && splitRows.length >= RANGE_THRESHOLD) {
    const gbTypes = mrGearboxFor(mrRule, spec.genCode, spec.trim, spec.year);
    if (gbTypes.includes("manual") && gbTypes.some(t => t !== "manual")) {
      const manRows = splitRows.filter(r => gearboxType(r) === "manual"), autRows = splitRows.filter(r => gearboxType(r) === "auto");
      const man = manRows.length, aut = autRows.length;
      const gbMaterial = splitMaterial(manRows.map(r => r._usd), autRows.map(r => r._usd));
      if (gbMaterial.material) {
        const lbl = autoGearboxLabel(mrRule, spec.genCode);
        // Question cap, OR the year already pinned the generation (bug 1: go straight to a result): the
        // gearbox split renders as an inline line instead of a question, so "1994 911 Coupe" lands on a
        // result rather than a Manual/PDK ask.
        if (askCapped || spec.genPinnedByYear) {
          const sp = inlineSplitRange(splitRows, gearboxType, "manual", "Manuals", "auto", lbl + "s");
          // poolN + unknown (job 3): manual + non-manual + unknown must sum to EXACTLY the headline
          // pool (splitRows.length) - a crossProductCheck/prePush invariant can assert this directly,
          // never just "no bigger than."
          if (sp) base.inlineSplits.push({ key: "gearbox", sides: sp, poolN: splitRows.length, unknown: splitRows.length - man - aut });
        } else {
          return { tier: "gearbox_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec, prompt: `Manual or ${lbl}? They price differently.`, gearboxOptions: ["Manual", lbl], optionCounts: [man, aut] };
        }
      }
    }
  }
  // COMPETITION QUESTION (Part 1 change 1, materiality unified Round 4 Job 3): an askable variant
  // (Competition / ZCP) becomes a QUESTION rather than being tagged out when it clears the ONE
  // shared splitMaterial predicate (SPLIT_MIN(3) each side + medians clearly apart) - replacing
  // the old 3/3-count-PLUS-25%-of-pool-share rule. The share requirement existed to stop asking
  // about a vanishingly rare variant even if it technically had 3 sales; splitMaterial's price-gap
  // test already catches that case more precisely (a 3-sale variant priced the same as the rest
  // isn't material regardless of its share), so the share check is retired, not stacked on top.
  // The chip answer re-scopes via refine.variant. Rare editions (CSL etc.) stay tagged out
  // (not _askable) - unchanged, a separate mechanism from this materiality gate.
  if (mrRule && !(refine && refine.variant) && chosen.step !== "thin") {
    const compRows = splitRows.filter(r => r._askable), stdRows = splitRows.filter(r => !r._askable);
    const comp = compRows.length, std = stdRows.length;
    const compMaterial = splitMaterial(compRows.map(r => r._usd), stdRows.map(r => r._usd));
    if (compMaterial.material) {
      // Question cap: a would-be third question becomes an inline split instead.
      if (askCapped) {
        const sp = inlineSplitRange(splitRows, r => r._askable ? "comp" : "std", "comp", "Competition Package cars", "std", "Standard cars");
        if (sp) base.inlineSplits.push({ key: "competition", sides: sp, poolN: splitRows.length, unknown: 0 });
      } else {
        return { tier: "variant_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec, prompt: "Competition Package or standard?", variantOptions: ["Competition Package", "Standard"], variantKey: "competition", optionCounts: [comp, std] };
      }
    }
  }
  // DOCUMENTED HISTORY QUESTION (Round 4 Job 3, rule 3): a PER-MODEL decision, never a global
  // fill-rate veto. sales_archive.desc_facts.markers (documented_history/matching_numbers, mined
  // from title+description) has ~15% fill GLOBALLY and is selection-biased globally (absence means
  // "didn't say it," not "doesn't have it") - but that global figure says nothing about any ONE
  // model's own sold records, which is what this checks, live, every time, via the SAME
  // splitMaterial predicate as every other dimension. Tested on the 1955 Mercedes-Benz 300SL
  // Coupe (Sam's own test case): 28 sales carry a marker (median $1,682,500), 60 do not (median
  // $1,435,000) - both sides clear SPLIT_MIN easily, but the gap is ~17%, well under the 40%
  // "clearly apart" bar every other dimension uses, and several "no marker" sales in the sample
  // (titles carrying a full chassis AND engine number) are plainly well-documented cars that
  // simply didn't use this mechanism's trigger phrases - confirming the marker is a noisy signal
  // for this model, not a clean split. Documented history correctly does NOT fire for the 300SL;
  // this gate exists so it DOES fire for whatever model's real numbers clear the bar, decided
  // fresh per query, never a static per-model allowlist.
  if (mrRule && !(refine && refine.docHistory) && chosen.step !== "thin") {
    const hasMarker = r => { const m = r.desc_facts && Array.isArray(r.desc_facts.markers) ? r.desc_facts.markers : []; return m.includes("documented_history") || m.includes("matching_numbers"); };
    const docRows = splitRows.filter(hasMarker), noDocRows = splitRows.filter(r => !hasMarker(r));
    const docMaterial = splitMaterial(docRows.map(r => r._usd), noDocRows.map(r => r._usd));
    if (docMaterial.material) {
      if (askCapped) {
        const sp = inlineSplitRange(splitRows, r => hasMarker(r) ? "doc" : "nodoc", "doc", "Documented-history cars", "nodoc", "Cars without documented history");
        if (sp) base.inlineSplits.push({ key: "docHistory", sides: sp, poolN: splitRows.length, unknown: 0 });
      } else {
        // {carPlural} (Round 4 Job 3, general template mechanism - see docs/lane-notes.md FOR LANE
        // A): a placeholder token, not a hardcoded car name - resolvedCar/resolvedSpec (already
        // returned alongside prompt on every tier) carry what Lane A needs to fill it in with the
        // real pluralized car name ("1955 Mercedes-Benz 300SL Coupes"), so this works for any
        // model, never a model-specific string baked into the engine.
        return { tier: "dochistory_choice", askIndex: asked + 1, resolvedCar, resolvedSpec: spec.resolvedSpec, prompt: "One thing separates these {carPlural} on price: whether the car has documented history.", docHistoryOptions: ["Has documented history", "No documented history"], optionCounts: [docRows.length, noDocRows.length] };
      }
    }
  }
  // GEARBOX APPLIES (item 4): the gearbox line shows on a card only when the gearbox question actually
  // applies to this car - the pool has BOTH a manual and a non-manual box. An all-manual car (a Shelby
  // Cobra, a pre-war car) never shows "Manual" on its hero, matching /sell. Mirrors htGearboxSplit.
  // Reads splitRows (job 3): the same fenced pool as the split/headline, not the raw chosen.rows.
  base.gearboxApplies = (function () {
    let man = 0, non = 0;
    for (const r of (splitRows || [])) { const g = gearboxType(r); if (g === "manual") man++; else if (g) non++; }
    return man > 0 && non > 0;
  })();
  // A driver refine filters on a mined flag that lives in the description, so enrich BEFORE building
  // or the filter would match nothing on the short titles.
  if (refine && (refine.driver || refine.observe)) await obEnrichDescriptions(chosen, env, diag);
  await obEnrichExtras(chosen, env, diag);
  mark("pool_chosen");
  let result = buildResult(chosen, base, iso, spec, refine);
  mark("result_built");
  // A TYPED BODY ON A CAR WHOSE LISTINGS STATE NO BODY (Sam, Oct 16 2026, e58): when no listing of the car states any
  // body (a Boxster, a Miata, a Cobra: titles carry no body word), the typed body word is accepted as a LABEL and the page
  // reads the whole pool, with one line saying so. Count and range come from the whole pool as usual (the eight-sale rule
  // applies). The chosen pool is the bare car's pool, so rebuilding without the body IS the bare page.
  // A BODY WITH NO ROW WHERE ROWS DO STATE BODIES: answers in words, never a cardless refusal that Buy, Sell and Tasks read
  // as no market ("No Cabriolet 2001 Porsche 911 Carrera 4S sale on record in the last five years.").
  if (refine && refine.body && refine.body !== "unspecified") {
    const bodyRule = mrRulesFor(spec.make, spec.model);
    const { body: _dropped, typedBody: _tb, ...rest } = refine;
    const restRefine = Object.keys(rest).length ? rest : null;
    // e59: the basis is the bare pool's QUALIFYING rows (what the chip options count), not every fetched row: a set-aside
    // "RS 60 Spyder" in the 2006 Boxster fetch, or a modified "Miata Roadster", must not stop the rule for a car whose
    // qualifying listings state no body.
    let bareSolid = [];
    try { bareSolid = buildPool(chosen, base, iso, spec, restRefine).solid || []; } catch (e) { bareSolid = []; }
    const stated = bareSolid.filter(r => !!rowBodyWordOf(r, bodyRule)).length;
    const bw = BODY_LABEL[String(refine.body)] || cap(String(refine.body));
    const nm = [spec.year, spec.make, spec.model, spec.trim].filter(Boolean).join(" ");
    if (bareSolid.length && stated === 0) {
      result = buildResult(chosen, base, iso, spec, restRefine);
      if (result && typeof result === "object") {
        result.bodyLine = `No listing of the ${[spec.year, spec.make, spec.model].filter(Boolean).join(" ")} states a body, so this reads every ${[spec.year, spec.model].filter(Boolean).join(" ")}.`;
        result.bodyLabel = bw;
        if (result.resolvedCar && typeof result.resolvedCar === "object") result.resolvedCar = { ...result.resolvedCar, bodyStyle: refine.body, applied: { ...(result.resolvedCar.applied || {}), body: refine.body } };
      }
    } else if (/^(refusal|thin)$/.test(String(result.tier || "")) && !(result.rawPool || []).length && !(result.cards || []).length) {
      // Rows that state THIS body but were every one set aside (project, modified, no photo, below the floor) are not
      // "no sale on record": the sentence says they were set aside, so it is never false.
      const fam = bodyFamily(refine.body);
      const asideN = (Array.isArray(chosen && chosen.rows) ? chosen.rows : []).filter(r => { const b = rowBodyWordOf(r, bodyRule); return !!b && bodyFamily(b) === fam; }).length;
      const words = asideN > 0
        ? `Every ${bw} ${nm} sale on record in the last five years was set aside (${asideN}), so there is no ${bw} read to show.`
        : `No ${bw} ${nm} sale on record in the last five years.`;
      return { tier: "not_tracked", dedup: diag, resolvedCar: { ...resolvedCar, bodyStyle: refine.body, applied: { body: refine.body, trim: null } }, resolvedSpec: spec.resolvedSpec, samLine: words, referenceFigure: null, referenceFigureReason: "no sales on record for this body", rungLabel: `${[spec.year, spec.model, spec.trim].filter(Boolean).join(" ")} ${bw}`, fallbackRung: "not_enough_data", cards: [], rawPool: [], setAsideRows: [], qualifyingTotal: 0, poolYears: null, readAt: new Date().toISOString() };
    }
  }
  // RUNG 4/5 RESCUE (Round 5 Lane B job, Oct 2026): the main year-scoped ladder itself came up thin
  // (or varied) - before settling for not_enough_data, try same-model-any-year then a named sibling,
  // the SAME rescue the totalN===0 cascade above already uses. Only reached when `chosen` itself did
  // not clear THIN(3); never overrides a real result.
  // Never after a body or trim chip (e44, Sam's Job 1b): the page a chip opens shows exactly its own rows, thin when
  // thin - "Convertible (1)" on the 2018 Mustang GT had rescued to "Mustang GT, all years" (86) through this path.
  if (result.tier !== "result" && !chipApplied) {
    const rescued = await anyYearOrSiblingRescue();
    if (rescued) result = rescued;
  }
  // A variant chip whose variant has no sale in the window at the generation's full span (e47, item 11): nothing on
  // record for that variant, said so, never the base pool dressed as the variant.
  if (refine && refine.variant && result.tier !== "result" && !(result.cards || []).length) {
    // e51: the chip may name the variant's OTHER side (nonKey, "unrestored"); that side answers in its own words.
    const pvk = (spec.variantMarkets || []).find(v => v.key === refine.variant) || null;
    const pvn = pvk ? null : ((spec.variantMarkets || []).find(v => v.nonKey && v.nonKey === refine.variant) || null);
    const pv = pvk || pvn;
    if (pv) {
      const nm = [spec.year, spec.make, spec.model, spec.trim].filter(Boolean).join(" ");
      const side = pvk ? pv.label : pv.base;
      return { tier: "not_tracked", dedup: diag, resolvedCar: { ...resolvedCar, applied: { variant: refine.variant } }, resolvedSpec: spec.resolvedSpec, samLine: `No ${side} ${nm} sale on record in the last five years.`, referenceFigure: null, referenceFigureReason: "no sales on record for this variant", rungLabel: `${[spec.model, spec.trim].filter(Boolean).join(" ")} ${cap(pv.label)}`, fallbackRung: "not_enough_data", cards: [], rawPool: [], setAsideRows: [], qualifyingTotal: 0, chipRows: (result.rawPool || []).length, chipTier: result.tier };
    }
  }
  // CANONICAL RUNG LABELING (Round 5 Lane B job, Oct 2026, Part 2): every answer carries
  // fallbackRung + rungLabel naming the pool it came from - present on an exact match too
  // ("Matched to {rungLabel}"), never only on a widened one. The rescue path above already
  // attaches its own (model_any_year / sibling); this covers the plain ladder outcomes
  // (result/thin/refusal) that reached here without needing the rescue. yearRungExact (set only
  // when the narrow exact-model-year fetch itself cleared THIN(3), above) is the one reliable
  // signal for "exact" - chosen.widening alone cannot distinguish an un-widened +/-2/generation
  // window (still "year_widened"/"generation") from a genuinely exact-year read.
  if (result.fallbackRung === undefined) {
    // LABEL TRUTHFULNESS (Part 2 rule c, "stated words never dropped"): nameplate used to carry only
    // model+trim, so a stated body ("Cabriolet") that doesn't already appear in those words vanished
    // from every label built from it - confirmed live, "2025 Porsche 911 Cabriolet" labeled its
    // widened answer "911 models, 2020 to 2026" with no mention of Cabriolet at all. Appended here,
    // once, so every branch below inherits it.
    // The body or trim a refine applied is part of the car now (e41, Job 2): it names the label like a typed word.
    const bodySel = spec.bodyStyle || (refine && refine.body) || null;
    // e53: the "Body not stated" page is labelled in words, never "Unspecified" as a body.
    const bodyWord = bodySel === "unspecified" ? null : (bodySel && !new RegExp(String(bodySel).replace(/[^a-z]/gi, ""), "i").test([spec.model, spec.trim].join(" ")) ? cap(String(bodySel)) : null);
    const pickedTrim = (!spec.trim && refine && refine.trim && result.poolTrim) ? String(result.poolTrim) : null;
    // A variant chip's page names its variant (e47, item 11): "356 Speedster Carrera four-cam models, 1958 to 1959".
    const pickedVariant = (refine && refine.variant) ? (spec.variantMarkets || []).find(v => v.key === refine.variant) : null;
    const variantWord = pickedVariant ? cap(pickedVariant.label) : null;
    // Rule (d): Defender 90/110/130 is its own variant dimension, not a trim or a body - when nothing
    // was stated (spec.trim empty) and the pool actually holds more than one door-count, name them
    // plainly ("Defender 90 and 110") rather than letting the label read as one undifferentiated model.
    const doorsWord = (!spec.trim && /land\s*rover/i.test(spec.make || "") && /defender/i.test(spec.model || "")) ? (() => {
      const found = new Set();
      for (const r of (result.rawPool || [])) { const m = /\b(90|110|130)\b/.exec(String(r.rtitle || r.raw_title || "")); if (m) found.add(m[1]); }
      // LABEL ORDER (Lane B job, Oct 2026, Part 5): ascending NUMBER ("90, 110 and 130"), never a plain
      // string sort - ".sort()" alone reads "110" before "90" and "130" before "90" (lexicographic).
      return found.size >= 2 ? joinList([...found].sort((a, b) => Number(a) - Number(b))) : null;
    })() : null;
    // BASE-TRIM LABEL (Part 3 golden-cars job, Oct 2026): a bare nameplate with a SUBTRIM_FENCES
    // entry (today just the 911) pools ONLY its base trims (rule 16/golden-rules.md section 2) -
    // the label must say so, since a reader of "911 models" assumes every 911, including 4S/T/GTS/
    // Targa/Turbo/GT3, which are all separate named options the trim question offers instead.
    // Deterministic on (make, model, no trim asked) - the SAME condition the pool-scoping fence
    // itself gates on above ("const fenceGroup = spec.trim ? null : subTrimGroupFor(...)"), so this
    // never claims a scope the pool did not actually apply.
    // e60: no base-trim words when the base scope was empty and the pool kept every row (a 1964 to 1973 911 pool holds
    // no Carrera; "911 Carrera and Carrera S Targa" named a scope the pool did not apply).
    const baseTrimWord = (!spec.trim && !pickedTrim && !result.baseScopeEmpty) ? (() => {
      const fg = subTrimGroupFor(spec.make, spec.model);
      const names = fg ? fg.fences.filter(f => f.base).map(f => f.name) : [];
      return names.length ? joinList(names) : null;
    })() : null;
    const nameplate = [spec.model, baseTrimWord, spec.trim || pickedTrim, variantWord, doorsWord, bodyWord].filter(Boolean).join(" ");
    // e62 (Sam, the 2019 BMW 3-Series and the 1989 Lancia Delta): an "exact" rung must hold only the asked year. The walk
    // can start from a whole generation's window without counting as widened, so a pool of 2019 to 2022 g20 cars was
    // labelled "2019 3-Series"; the output gate then refused it and cleared the sales. Exact only when every included sale
    // is the asked year; otherwise the year-widened label below names the years the pool really holds.
    const exactYs = (result.rawPool || []).map(r => Number(r.year)).filter(Number.isFinite);
    const trulyExact = yearRungExact && (!spec.year || !exactYs.length || exactYs.every(y => y === Number(spec.year)));
    if (trulyExact) {
      result.fallbackRung = "exact";
      result.rungLabel = [spec.year, nameplate].filter(Boolean).join(" ");
    } else if (chosen.step === "exact_trim_keyword") {
      result.fallbackRung = "year_widened";
      result.rungLabel = `${nameplate}, by title match`;
    } else if (chosen.step === "family" || chosen.step === "family_wide") {
      result.fallbackRung = "model_any_year";
      result.rungLabel = `${spec.model}, all years`;
    } else if (spec.year) {
      // THE RUNG AND THE LABEL DESCRIBE THE POOL EXACTLY (Sam, Oct 14 2026, golden car 12): the years the
      // receipts really hold, from the pool's own rows. The one-year-at-a-time walk stops at the first span
      // that reaches eight, so a generation-bound spec usually lands well inside its generation (the 2024
      // GT3: 2023 and 2024 only, inside the 992's 2020 to 2026) - that is the year-widened rung, labelled
      // with those years, never "(992 generation)". The generation rung is only the walk that had to take
      // the whole generation, and it says so only when the receipts actually span the generation's years;
      // a pool that spans fewer years is labelled with the years it holds. genYears carries the bound so
      // the output check (label_span_within_receipts) can test a generation label against the receipts.
      const ys = (result.rawPool || []).map(r => Number(r.year)).filter(Number.isFinite);
      const lo = ys.length ? Math.min(...ys) : null, hi = ys.length ? Math.max(...ys) : null;
      const spansGen = !!(spec.genBound && spec.genCode && lo != null && lo <= spec.yearMin && hi >= spec.yearMax);
      if (spec.genBound && spec.genCode) result.genYears = [spec.yearMin, spec.yearMax];
      if (spansGen) {
        result.fallbackRung = "generation";
        result.rungLabel = `${nameplate} (${spec.genCode} generation)`;
      } else {
        result.fallbackRung = "year_widened";
        result.rungLabel = lo == null ? nameplate : lo === hi ? `${nameplate} models, ${lo}` : `${nameplate} models, ${lo} to ${hi}`;
      }
    } else {
      result.fallbackRung = "exact";
      result.rungLabel = nameplate || spec.make;
    }
    // LABEL TRUTHFULNESS (Part 2 rule b): a query that named no body gets told when its own pool
    // actually holds more than one - never claimed for a rung that already names one body (the
    // nameplate fix above) or the all-years/sibling/keyword rungs, which name no single pool at all.
    if (typeof result.rungLabel === "string") result.rungLabel += (refine && refine.body === "unspecified") ? ", body not stated in the listing" : bodyMixSuffix((refine && refine.body) ? { ...spec, bodyStyle: refine.body } : spec, result.rawPool);
    // Variant set-aside in the scope line (Job 4): the range is the base cars, the variant named and counted.
    if (typeof result.rungLabel === "string") result.rungLabel += variantSuffixAll(result);
  }
  // scopeLabel (Part 5, Oct 2026): the label INCLUDING the years the pool actually used - the same
  // rungLabel every surface already reads, under one plainly-named field so a consumer never has to
  // know "rungLabel" is where the scope lives. liveScope: one plain sentence naming the SAME scope
  // against the SAME range, built from the exact fields above - no second fence, no source/venue
  // count (per Sam's correction).
  if (typeof result.rungLabel === "string") {
    result.scopeLabel = result.rungLabel;
    const rangeClause = Array.isArray(result.cluster) ? ` against ${usd(result.cluster[0])} to ${usd(result.cluster[1])}` : (Array.isArray(result.span) ? ` against ${usd(result.span[0])} to ${usd(result.span[1])}` : "");
    result.liveScope = `Comparing live listings to ${result.rungLabel}${rangeClause}.`;
  }
  // ownSales (Job 5): the exact car's own receipts out of this same answer, see ownSalesFor.
  if (/^(result|thin|refusal)$/.test(String(result.tier || ""))) result.ownSales = ownSalesFor(vehicle, result.cards, result.asideCards, result.cluster);
  if (result.tier === "result") {
    result.freshness = obFreshness(result.houseLed, result.newestSale, ingestDate, now);
    // Item 7 BOUNDED SECOND FETCH: wide band + a dictionary family for this car, but the title-only
    // mining produced no dictionary candidate (the flag lives in the description). Fetch just this
    // pool's descriptions and re-run so the dictionary can mine title+description. Only descriptions
    // path, only on wide-band results, one bounded id-keyed query; on any failure keep the first result.
    const fam = driversForVehicle(base.vehicle);
    const dd = result.driverDiag;
    if (!(refine && refine.driver) && fam.length && dd && dd.wideBand && !(dd.candidates || []).some(c => fam.some(f => f.key === c.k))) {
      const ms = await obEnrichDescriptions(chosen, env, diag);
      const r2 = (ms != null) ? buildResult(chosen, base, iso, spec, refine) : null;
      // Always record the second-fetch telemetry on whichever result we keep, so the selection is auditable.
      const stamp = { descFetchMs: diag.descFetchMs != null ? diag.descFetchMs : (ms != null ? ms : "fetch_failed"), descEnriched: diag.descEnriched, descPoolSize: diag.descPoolSize, postDict: r2 && r2.driverDiag ? r2.driverDiag.dict : null };
      if (dd) Object.assign(dd, stamp);
      if (r2 && r2.tier === "result" && r2.earned && r2.earned.kind === "driver") {
        r2.freshness = result.freshness;
        if (r2.driverDiag) Object.assign(r2.driverDiag, stamp);
        result = r2;   // the dictionary question now fires from description mining
      }
    }
    // Market Check engine additions, item 4 (didNotSellCount) and item 6 (soldBefore): attached
    // once, on the FINAL result (after the possible second-fetch swap above), never doubled by the
    // rare wide-band re-render. Same window the pool itself landed on (the pool's own earliest
    // date - empirically correct for whichever rung won, never a guessed day count); same spec
    // (make/model/chassis-code union, year bounds) as the rest of this result.
    const sinceForExtras = (result.rawPool || []).map(r => String(r.auction_end_date || "").slice(0, 10)).filter(Boolean).sort()[0] || iso(730).slice(0, 10);
    const [dns] = await Promise.all([
      didNotSellForSpec(spec, sinceForExtras, env),
      attachSoldBefore(result.cards || [], result.rawPool || [], env),
      attachHistoryPage(result.cards || [], result.rawPool || [], env)
    ]);
    result.didNotSellCount = countWord(dns.count);
    result.didNotSellCountN = dns.count;   // e60 (Sam): numeric sibling
    result.didNotSellRows = dns.count ? dns.rows : null;
  }
  return finalStamp(result, { spec, resolvedCar, asked, askCapped, mark, refine });
}

// STEP 4: a make-only or otherwise model-ambiguous input ("1989 Porsche") ASKS which
// model, with real model chips from the archive (mirrors the body-style disambiguation),
// instead of a flat rejection. Chips are the make's highest-volume real models for the
// era, so every chip leads to actual comps. Returns null (fall through to the normal
// re-ask) only when the make has no usable archive models at all.
// The make's most-SOLD models by archive sales count (bare-make model chips, Part 2). Collapses chassis
// codes into the base model (996/997 -> 911) via deskModelFamily so the chips are real models, not gen
// codes, and ranks by count. Archive-only, cars-only, last 3 years. Returns up to n base model names.
async function topModelsForMake(env, make, n) {
  try {
    if (!env || !make) return [];
    const since = new Date(obNow() - 1095 * 864e5).toISOString().slice(0, 10);
    const rows = await supabaseSelectAll(env, `sales_archive?select=model&make=eq.${encodeURIComponent(make)}&model=not.is.null&sale_price=not.is.null${VT_CAR}&sale_date=gte.${since}`);
    if (!rows || !rows.length) return [];
    const counts = {};
    for (const r of rows) {
      const raw = String(r.model || "").trim(); if (!raw || /^unknown$/i.test(raw)) continue;
      let fam; try { fam = mrModelFamily({ make, model: raw }) || raw; } catch { fam = raw; }
      fam = String(fam || "").trim(); if (!fam || /^unknown$/i.test(fam)) continue;
      counts[fam] = (counts[fam] || 0) + 1;
    }
    // Chip-name tidy-up: say it how a buyer says it ("1 Series", not "1-Series"); dedupe the two spellings.
    // Mercedes bare displacement codes (560, 190, 300) are not buyer-named models - the -Class chips
    // cover them - so drop a pure-number Mercedes family. (BMW 2002 and Porsche 911/356/944 stay: those
    // ARE the model's name.)
    const isMercedes = /mercedes|benz/i.test(make);
    const normalizeChip = s => String(s).replace(/[-\s]+Series\b/i, " Series").replace(/\s{2,}/g, " ").trim();
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([m]) => m);
    const seen = new Set(), out = [];
    for (const m of ranked) {
      if (isMercedes && /^\d{2,4}$/.test(m)) continue;   // drop bare displacement codes for Mercedes
      const nm = normalizeChip(m), k = nm.toLowerCase();
      if (nm && !seen.has(k)) { seen.add(k); out.push(nm); }
      if (out.length >= n) break;
    }
    return out;
  } catch (e) { return []; }
}
// ---------------------------------------------------------------------------------------------
// ONE SHARED ENGINE ENTRY POINT (Oct 2026, "engine only" unification job). Market Check, Buy,
// Sell and Tasks all call oneEngineAnswer() for an answer about a resolved car - never runOneBox
// directly from a product call site, and never a second, hand-rolled tier whitelist (the Buy/
// Tasks "class_era" gap - lib/live/search.js's old walkLadder only recognized result/thin/
// refusal and silently discarded class_era, body_unavailable and every *_choice tier as if the
// engine had answered nothing). mapEngineAnswer below is the ONE place every one of runOneBox's
// tiers is translated into the four answer types Lane C's event layer will log against:
//   "range"            - a real cluster/band exists for this exact car (today's tier "result").
//   "identity_question" - the engine needs ONE more fact to split sales into two real groups
//                         (generation_choice, body_choice, gearbox_choice, variant_choice,
//                         model_choice - every *_choice tier, so Buy/Tasks can offer the SAME
//                         question Market Check asks instead of forcing a guess and discarding
//                         the result as null).
//   "not_enough_data"  - real sales exist but not enough / too spread for a range (thin, refusal,
//                         class_era, body_unavailable) - factsBlock carries count/window/lowest/
//                         highest/latest-price/latest-month, NEVER a range or a middle (product
//                         rule 24), and reasonFlag names EXACTLY what was measured, so a page
//                         never has to say "not enough" without saying why (the 300SL "32 sales,
//                         not enough" bug - the copy says "not enough for a range" when the gate
//                         that actually fired tested a different, smaller, unshown online-only
//                         count - this factsBlock carries the real figures so that frontend bug,
//                         out of this file's scope, can be fixed from real data instead of guessing).
//   "zero_result"      - genuinely nothing on record (not_tracked), or the engine gave back
//                         nothing at all (a timeout/failed read, never confused with a real
//                         empty-archive answer by the caller - reasonFlag distinguishes them).
// yearWidened mirrors the engine's own `widening` sentence (non-null = the ladder widened past
// the exact year/trim to find enough sales - reusing the engine's existing signal, not a new
// one). fallbackRung mirrors the engine's own `ladderStep` (exact_trim, exact_trim_wide, family,
// family_wide, base, thin, varied, class_era, not_tracked) - again the engine's own name, not a
// new vocabulary Lane C would have to learn twice.
const IDENTITY_CHOICE_TIERS = new Set(["generation_choice", "gearbox_choice", "body_choice", "variant_choice", "model_choice", "dochistory_choice"]);
// "class_era" REMOVED (Round 5 Lane B job, Oct 2026): the tier no longer exists - classEraGuarded/
// assessClassEra are deleted, so runOneBox never returns it. thin/refusal/body_unavailable are
// unchanged: that pool IS the car's own sales, just too few for a computed range.
const NOT_ENOUGH_DATA_TIERS = new Set(["thin", "refusal", "body_unavailable"]);
// factsBlockFrom (Round 5 Lane B job, Oct 2026, Part 1 rung 6 "not_enough_data"): the classEra
// param is GONE along with the tier it guarded - every remaining not-enough-data tier is this
// car's own sales, so a facts-block low/high is the real record, never a fake number. NEW this
// round: low/high/latestPrice only render once the count reaches RANGE_THRESHOLD(8) - below that,
// a "range" of 2-7 sales is not an honest typical band, just the count and the latest sale month
// (Sam's rung 6 spec, "range only if count reaches RANGE_THRESHOLD").
function factsBlockFrom(d) {
  const cards = Array.isArray(d && d.cards) ? d.cards : [];
  if (!cards.length) return null;
  const priced = cards.filter(c => Number.isFinite(Number(c.price)));
  const prices = priced.map(c => Number(c.price));
  const byDateDesc = priced.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const latest = byDateDesc[0] || null;
  const hasRange = cards.length >= RANGE_THRESHOLD && prices.length > 0;
  return {
    count: cards.length,
    window: d.windowLabel || null,
    lowest: hasRange ? Math.min(...prices) : null,
    highest: hasRange ? Math.max(...prices) : null,
    latestPrice: hasRange && latest ? (Number(latest.price) || null) : null,
    latestMonth: latest && latest.date ? String(latest.date).slice(0, 7) : null,
    // onlineLiquidityN (300SL copy-bug fix, Round 4 Job 3): `count` above is the TRUE, honest total
    // shown (every sale behind the facts block - 32 for the 300SL case) - never changed, it's a
    // real fact. The "thin" tier's OWN gate (assessThin, HT_ONLINE_MIN=8) tests a DIFFERENT, smaller
    // number - online-only liquidity over 36 months - not this total, so a reasonFlag/sentence that
    // names `count` as "not enough" is naming a number that never gated anything. This carries the
    // number that actually did, so a renderer can say what was really measured instead of guessing
    // from the total. Null for every OTHER not-enough-data tier (refusal/body_unavailable), which
    // are not gated by online liquidity at all.
    onlineLiquidityN: d && d.thin && Number.isFinite(d.thin.onlineN) ? d.thin.onlineN : null,
  };
}
// TIER_DIMENSION (URGENT fix, Oct 2026, defect 4): a bare tier.replace(/_choice$/, "") does not
// always match the contract documented in docs/lane-notes.md FOR LANE A - "variant_choice" gave
// "variant" where the contract (and the response's OWN variantKey field, set where variant_choice
// is returned) says "competition"; "dochistory_choice" gave "dochistory" where the contract (and
// the marker string used everywhere else in this file, desc_facts.markers.includes(
// "documented_history")) says "documented_history". Named explicitly so the two can never drift
// apart again; every OTHER tier's bare-strip name was already correct and is kept identical here.
export const TIER_DIMENSION = { generation_choice: "generation", gearbox_choice: "gearbox", body_choice: "body", variant_choice: "competition", model_choice: "model", dochistory_choice: "documented_history" };
function identityQuestionFrom(d, tier) {
  const rawOptions = d.generationOptions || d.gearboxOptions || d.bodyOptions || d.variantOptions || d.modelOptions || d.docHistoryOptions || [];
  const counts = Array.isArray(d.optionCounts) ? d.optionCounts : null;
  return {
    dimension: TIER_DIMENSION[tier] || tier.replace(/_choice$/, ""), blocking: true,
    // questionText (Round 4 Job 3, general template mechanism): the engine's own prompt, verbatim
    // - may contain the {carPlural} placeholder (see docs/lane-notes.md FOR LANE A) for a tier
    // whose wording references the car (today: dochistory_choice only); every other tier's prompt
    // is already car-agnostic ("Manual or PDK?") and simply has no placeholder to replace.
    questionText: d.prompt || null,
    options: rawOptions.map((label, i) => ({ label, count: counts && Number.isFinite(counts[i]) ? counts[i] : null })),
    skipLabel: "Just show what sold",
  };
}
// Trim question (Round 4 Job 3): unlike the four *_choice tiers above, a material trim split
// (lib/onebox.js's trimQuestion, now gated by the SAME splitMaterial predicate) is NON-BLOCKING -
// it renders alongside a real range, never in place of one (trim refinement has always shown as
// chips next to the result, a deliberately different, hardened shape from the blocking generation/
// body/gearbox/competition asks - not changed here, per Sam's no-regression test case). Surfaced
// through the SAME identityQuestion data contract so Lane A has one shape to read from, with
// `blocking: false` naming the difference explicitly rather than leaving it to be inferred from
// answerType staying "range".
function identityQuestionFromTrim(tq) {
  if (!tq || !Array.isArray(tq.options) || tq.options.length < 2) return null;
  return {
    dimension: "trim", blocking: false,
    options: tq.options.map(o => ({ label: o.label, count: o.n })),
    skipLabel: "Just show what sold",
  };
}
// Pure (no I/O): translates one runOneBox answer `d` into the standard object. Exported so a
// caller that already has a `d` (e.g. a cached read) can map it without re-running the engine.
export function mapEngineAnswer(d, latencyMs) {
  const engineVersion = ENGINE_VERSION;
  // queryMileage (Round 5 Lane B job, Oct 2026, Part 4): a mileage parsed out of the typed query
  // ("8,500 miles", "32k miles"), passed through unchanged from the engine's own subjectMileage
  // (lib/vehicle.js extractMileage -> runOneBox's subject.mileage -> base.subjectMileage) - present
  // on every answer shape, never recomputed here. Does NOT change the pool or the range in this
  // job (per the brief); a renderer may pre-fill the mileage refinement chip with it.
  const base = { engineVersion, latencyMs: Number.isFinite(latencyMs) ? latencyMs : null, queryMileage: (d && Number.isFinite(Number(d.subjectMileage)) && Number(d.subjectMileage) > 0) ? Number(d.subjectMileage) : null,
    // readAt + trend quarters (Sam, Oct 16 2026): the read time, and for each trend quarter its period, low, high and
    // sale count, passed through from the engine's own answer; no pool, fence or range is changed by carrying them.
    readAt: (d && d.readAt) || null,
    latestSaleDate: (d && d.latestSaleDate) || null, oldestIncludedSaleDate: (d && d.oldestIncludedSaleDate) || null,
    latestSaleLine: (d && d.latestSaleLine) || null, includesFromLine: (d && d.includesFromLine) || null, basisLine: (d && d.basisLine) || null,
    bodyLine: (d && d.bodyLine) || null, bodyLabel: (d && d.bodyLabel) || null,
    trendQuarters: d && d.trend && Array.isArray(d.trend.quarters) ? d.trend.quarters.map(q => ({ period: q.period, low: q.low ?? null, high: q.high ?? null, count: Number(q.count) || 0, thin: !!q.thin })) : null };
  if (!d) return { ...base, answerType: "zero_result", poolSize: 0, low: null, high: null, reasonFlag: "engine_read_failed", yearWidened: false, fallbackRung: null, rungLabel: null, siblingName: null, identityQuestion: null, factsBlock: null };
  const tier = String(d.tier || "");
  // fallbackRung/rungLabel/siblingName (Round 5 Lane B job, Oct 2026, Part 2): read DIRECTLY off
  // the raw engine answer - runOneBox now attaches these on every result/thin/refusal/rescue return
  // itself (canonical rung vocabulary: exact, year_widened, generation, model_any_year, sibling,
  // not_enough_data), never derived a second time here from the older ladderStep name. Present on
  // EVERY answer per the brief, including an exact match ("Matched to {rungLabel}").
  const rung = { fallbackRung: d.fallbackRung || null, rungLabel: d.rungLabel || null, siblingName: d.siblingName || null };
  if (tier === "result") {
    const low = Array.isArray(d.cluster) ? d.cluster[0] : null;
    const high = Array.isArray(d.cluster) ? d.cluster[1] : null;
    return { ...base, answerType: "range", poolSize: (d.poolN ?? (Array.isArray(d.cards) ? d.cards.length : null)), low: low ?? null, high: high ?? null, reasonFlag: null, yearWidened: !!d.widening, ...rung, identityQuestion: identityQuestionFromTrim(d.trimQuestion), factsBlock: null };
  }
  if (IDENTITY_CHOICE_TIERS.has(tier)) {
    // No pool decision has been made yet - an identity question fires BEFORE the ladder runs -
    // so fallbackRung/rungLabel are honestly null here, not a guess at what rung would follow.
    return { ...base, answerType: "identity_question", poolSize: null, low: null, high: null, reasonFlag: null, yearWidened: false, fallbackRung: null, rungLabel: null, siblingName: null, identityQuestion: identityQuestionFrom(d, tier), factsBlock: null };
  }
  if (tier === "read_failed") {
    return { ...base, answerType: "zero_result", poolSize: null, low: null, high: null, reasonFlag: "engine_read_failed", yearWidened: false, fallbackRung: null, rungLabel: null, siblingName: null, identityQuestion: null, factsBlock: null };
  }
  if (tier === "not_tracked") {
    // The absolute zero-evidence terminal state - the extreme case of rung 6 (not_enough_data,
    // count 0) - answerType stays zero_result (unchanged meaning, no sales on record at all) but
    // fallbackRung still names the rung per the "present on every answer" rule.
    return { ...base, answerType: "zero_result", poolSize: 0, low: null, high: null, reasonFlag: "no_sales_on_record", yearWidened: false, fallbackRung: "not_enough_data", rungLabel: d.rungLabel || null, siblingName: null, identityQuestion: null, factsBlock: null };
  }
  if (NOT_ENOUGH_DATA_TIERS.has(tier)) {
    const fb = factsBlockFrom(d);
    // 300SL copy-bug fix, Round 4 Job 3: tier "thin" is ALWAYS gated by online liquidity
    // (assessThin's isThin = onlineVolumeN < HT_ONLINE_MIN - by construction, the only condition
    // that produces this tier), never by the shown total being too small - the 1955 Mercedes-Benz
    // 300SL Coupe case has 32 sales total (fb.count, well above RANGE_THRESHOLD=8) but only a
    // handful sold through live online marketplaces in the window, which is the actual, different,
    // smaller number that gated it. A generic "too_few_in_window" flag here would name the wrong
    // measurement; "thin" gets its own flag naming what was really measured.
    const reasonFlag = tier === "body_unavailable" ? "body_not_offered_for_this_car"
      : tier === "thin" ? "too_few_online_for_a_range"
      : (d.refusal && d.refusal.kind === "varied") ? "too_spread_unresolved"
      : "too_few_in_window";
    return { ...base, answerType: "not_enough_data", poolSize: fb ? fb.count : 0, low: null, high: null, reasonFlag, yearWidened: !!d.widening, ...rung, identityQuestion: null, factsBlock: fb };
  }
  // An unmapped tier is a gap in THIS function, never silently treated as zero_result's "nothing
  // on record" - reasonFlag names the unmapped tier so it shows up instead of hiding as a normal
  // empty answer.
  return { ...base, answerType: "zero_result", poolSize: 0, low: null, high: null, reasonFlag: "unmapped_tier:" + (tier || "none"), yearWidened: false, fallbackRung: tier || null, rungLabel: null, siblingName: null, identityQuestion: null, factsBlock: null };
}
// THE FIVE OUTPUT CHECKS (Part 4 golden-cars job, Oct 2026; moved here from scripts/
// crossProductCheck.js's checkOutputInvariants - ONE implementation, never a second copy that could
// drift). Pure function of a raw runOneBox answer `d` plus the resolved `vehicle` - no env/DB needed.
// Check (i) now reads the structured make/model columns each card carries (shapeCards, above) instead
// of regexing the human-formatted title - the source of the old title-matching false positives (911T
// vs 911, 356A vs 356, 300 SL vs 300SL, Mazda Roadster vs MX-5, 'Cuda vs Barracuda all failed a
// word-boundary title regex that a structured column comparison does not). scripts/
// crossProductCheck.js re-exports this under its old name for the sweep's own reporting.
function titleHasToken(title, token) {
  if (!title || !token) return false;
  const esc = String(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("\\b" + esc + "\\b", "i").test(String(title));
}
export function runOutputInvariants(d, vehicle) {
  const out = [];
  const add = (name, ok, detail) => out.push({ name, ok: !!ok, detail });
  if (!d || !d.tier) { add("engine_answered", false, "no tier on the engine answer"); return out; }
  const cards = Array.isArray(d.cards) ? d.cards : [];
  const rawPool = Array.isArray(d.rawPool) ? d.rawPool : [];
  const isResultLike = /^(result|thin)$/.test(d.tier);
  const onOwnPool = d.fallbackRung !== "sibling";

  // (i) Receipts carry the resolved make and model - every card's OWN structured make/model columns
  // (never the display title) match the resolved vehicle, UNLESS this landed on a named sibling
  // (rule 25's corollary: a sibling pool deliberately shows ITS OWN, different car, and says so via
  // rungLabel/siblingName). A card with no make/model column (an older cached shape, or a keyword-
  // route card that never carried it) is not flagged - absence is not evidence of a wrong car.
  if (isResultLike && cards.length) {
    if (onOwnPool) {
      const make = vehicle && vehicle.make, model = vehicle && vehicle.model;
      // CHASSIS-CODE ALIAS (found live, Oct 2026): OldCarsData files some generations under their own
      // chassis-code model name instead of the nameplate (a 2024 "911" sale can carry model:"992" -
      // see docs CLAUDE.md "OCD chassis-code models"). This is a LEGITIMATE, already-fetched-on-
      // purpose alias (generationModelToken, lib/generations.js - the same union runOneBox's own
      // fetch already relies on), never a wrong car; confirmed live via task=obdiag&gate=1, a real
      // 2025 Porsche 911 pool flagged 9/12 cards as "Porsche 992" before this fix. The resolved car's
      // own genCode is accepted as an equally-valid model token alongside the typed model.
      const genCode = d.resolvedCar && d.resolvedCar.genCode ? String(d.resolvedCar.genCode).split(".")[0] : null;
      // The other spelling of the same car (e36, chassisAltModels): a "997" query's pool holds rows filed
      // under "911" on purpose (the fetch unions them), so the nameplate is the resolved car too.
      const altToks = chassisAltModels({ make, model, genCode: d.resolvedCar && d.resolvedCar.genCode });
      // ARCHIVE MODEL COLUMN IS AN ALIAS FIELD, NOT A KEY (found live, Oct 13 2026, e30 refused three golden
      // cars): OldCarsData's model column reads "Grand National - Regal" for a Regal Grand National, "CLK AMG"
      // and "CLK63 AMG Black" for a CLK-Class, "3-Series" for an M3 Coupe, "992" for a 911. The first cut
      // of this check compared first tokens the wrong way round (titleHasToken's arguments are title then
      // token) and had no title fallback, so every alias read as a wrong car and the gate downgraded
      // correct 55-, 35- and 14-sale answers to not_enough_data. A card now counts as the resolved car when
      // ANY of these hold: the column carries the model's first token as a word (or the model carries the
      // column's); the two first tokens share an alphabetic stem of three letters or more ("CLK" in "CLK63"
      // and "CLK-Class"); the column or the title carries the chassis code (generationModelToken, the union
      // the fetch itself relies on); or the card's OWN TITLE carries the model's first token (rule 25: the
      // title is the car's own identity). Membership was already decided by the fetch's fences; this check
      // only has to catch a SWAPPED pool, so it fails only when the strays are at least half the cards - a
      // minority stray (one 365 GT 2+2 whose chassis number 12751 contains "275", in a 14-sale 275 pool)
      // is named in the detail and logged, never a reason to hide thirteen good receipts.
      const tok = s => String(s || "").trim().split(/\s+/)[0] || "";
      const stem = s => (String(s || "").toLowerCase().match(/^[a-z]+/) || [""])[0];
      const mTok = tok(model), mStem = stem(mTok);
      const modelOk = c => {
        if (!model) return true;
        const cm = String(c.model || ""), cTok = tok(cm), cStem = stem(cTok), title = String(c.title || "");
        if (cm && (titleHasToken(cm, mTok) || titleHasToken(String(model), cTok))) return true;
        if (mStem.length >= 3 && cStem.length >= 3 && (mStem.startsWith(cStem) || cStem.startsWith(mStem))) return true;
        if (genCode && (titleHasToken(cm, genCode) || titleHasToken(title, genCode))) return true;
        if (altToks.some(a => titleHasToken(cm, a) || titleHasToken(title, a))) return true;
        // e67 part (c): a badge of the model's own family (the S-Class read finds "560SEL" by its badge) is the resolved car
        if (familyBadgeMatch({ make, model }, { title, model: cm })) return true;
        return titleHasToken(title, mTok);
      };
      // e67 (Sam, the 1985 Dodge D50): a model whose rules name APPROVED SIBLING NAMEPLATES (modelRules poolTerms: the D50 is
      // also the Ram 50, the Plymouth Arrow Truck and the Mitsubishi Mighty Max) pools them by design, each card under its
      // own title (rule 25); a card whose title carries one of those names is the resolved car, whatever make it shows.
      const sibRule = mrRulesFor(make, model);
      const sibTerms = (sibRule && Array.isArray(sibRule.poolTerms) ? sibRule.poolTerms : []).map(t => String(t).toLowerCase()).filter(Boolean);
      const sibOk = c => sibTerms.length > 0 && sibTerms.some(t => String(c.title || "").toLowerCase().includes(t));
      const bad = (make || model) ? cards.filter(c => (c.make || c.model) && !sibOk(c) && !(
        (!make || titleHasToken(String(make), String(c.make || "")) || titleHasToken(String(c.title || ""), tok(make))) && modelOk(c)
      )).map(c => `${c.make || "?"} ${c.model || "?"} (${c.title})`) : [];
      const swapped = bad.length > 0 && bad.length * 2 >= cards.length;
      add("receipts_carry_resolved_car", !swapped, swapped ? `${bad.length}/${cards.length} cards carry a different make/model than "${make} ${model}" (a swapped pool): ${bad.slice(0, 3).join(" | ")}`
        : bad.length ? `all but ${bad.length} of ${cards.length} cards carry make/model matching "${make} ${model}"; strays (minority, answer stands): ${bad.slice(0, 3).join(" | ")}` : `all ${cards.length} cards carry make/model matching "${make} ${model}"`);
    } else {
      add("receipts_carry_resolved_car", !!d.siblingName, "sibling rung: receipts are the sibling's own car by design (rule 25 corollary), skipped");
    }
  } else {
    add("receipts_carry_resolved_car", true, "no receipts to check (tier=" + d.tier + ")");
  }

  // (ii) Typed words honoured, or the label says wider.
  if (vehicle && vehicle.trim) {
    const trimTok = String(vehicle.trim).split(/\s+/)[0];
    const label = String(d.rungLabel || d.resolvedCar?.trim || "");
    // A trim the LABEL itself names is honoured (found live, Oct 13 2026: "2008 CLK63 Black Series" names the
    // typed "CLK63 AMG" trim's own token, but resolvedCar.trim read differently and this check downgraded the
    // 35-sale answer). The label is what the reader sees; a token in it was never dropped.
    const trimHonoured = (d.resolvedCar && titleHasToken(String(d.resolvedCar.trim || ""), trimTok)) || titleHasToken(label, trimTok) || titleHasToken(String(d.scopeLabel || ""), trimTok);
    const labelSaysWider = /\bany year\b|cross-generation|wider|closest|all years|sibling|family|class|on record separately/i.test(label);   // e67: Sam's widening words
    add("typed_words_honoured_or_wider", !!(trimHonoured || labelSaysWider || !d.fallbackRung), trimHonoured ? `trim "${vehicle.trim}" honoured` : (labelSaysWider ? `trim dropped, label says wider: "${label}"` : `trim "${vehicle.trim}" dropped with no widening language in rungLabel "${label}"`));
  } else {
    add("typed_words_honoured_or_wider", true, "no trim typed");
  }

  // (iii) poolSize equals receipts.
  if (isResultLike) {
    const poolN = Number.isFinite(d.poolN) ? d.poolN : (d.thin ? d.thin.totalN ?? d.thin.n : null);
    add("poolsize_equals_receipts", poolN == null || poolN === cards.length, poolN == null ? "no poolN/thin.totalN to compare" : (poolN === cards.length ? `poolN ${poolN} == ${cards.length} cards` : `poolN ${poolN} != ${cards.length} cards`));
  } else {
    add("poolsize_equals_receipts", true, "no receipts to check (tier=" + d.tier + ")");
  }

  // (iv) The range comes from receipts only.
  if (d.tier === "result" && Array.isArray(d.cluster)) {
    const prices = rawPool.map(r => Number(r._usd ?? r.price)).filter(Number.isFinite);
    if (prices.length) {
      const lo = Math.min(...prices), hi = Math.max(...prices);
      const within = d.cluster[0] >= lo - 1 && d.cluster[1] <= hi + 1;
      add("range_from_receipts_only", within, within ? `cluster ${d.cluster[0]}-${d.cluster[1]} sits inside the pool's own ${lo}-${hi}` : `cluster ${d.cluster[0]}-${d.cluster[1]} falls OUTSIDE the pool's own priced range ${lo}-${hi}`);
    } else {
      add("range_from_receipts_only", true, "no priced rawPool rows to check against (cluster unverifiable here)");
    }
  } else {
    add("range_from_receipts_only", true, "no cluster to check (tier=" + d.tier + ")");
  }

  // (v) A sibling is served only when the car's own pool has nothing.
  if (d.siblingName) {
    add("sibling_only_when_own_pool_empty", d.fallbackRung === "sibling", d.fallbackRung === "sibling" ? `siblingName "${d.siblingName}" served via the sibling rung, own pool exhausted first` : `siblingName "${d.siblingName}" set but fallbackRung is "${d.fallbackRung}", not "sibling"`);
  } else {
    add("sibling_only_when_own_pool_empty", true, "no sibling served");
  }

  // (vii) Identity options add up (e41, Sam's Job 1): every body option counts the page it opens (n equals the rows
  // it holds in this pool), and the options plus the unspecified rows equal the pool.
  if (isResultLike && Array.isArray(d.bodyOptions) && d.bodyOptions.length) {
    // e54: when "Body not stated" is one of the options it already holds the unspecified rows; counting
    // bodyUnspecified again made every bare page with such rows fail this gate (a refusal with no cards on the
    // public path: the 1965 Mustang and 1969 Camaro pages went blank on e53).
    const covered = d.bodyOptions.some(o => o && o.value === "unspecified");
    const sum = d.bodyOptions.reduce((s, o) => s + (Number(o.inPool) || 0), 0) + (covered ? 0 : (Number(d.bodyUnspecified) || 0));
    const poolN = Number.isFinite(d.poolN) ? d.poolN : rawPool.length;
    const eachOpens = d.bodyOptions.every(o => Number(o.n) === Number(o.inPool));
    add("identity_options_sum_to_pool", sum === poolN && eachOpens, sum === poolN && eachOpens ? `options ${d.bodyOptions.map(o => o.label + " " + o.n).join(", ")} + ${Number(d.bodyUnspecified) || 0} unspecified = pool ${poolN}` : `options sum ${sum} (unspecified ${Number(d.bodyUnspecified) || 0}) vs pool ${poolN}; each option opens its own count: ${eachOpens}`);
  } else {
    add("identity_options_sum_to_pool", true, "no body options on this answer");
  }
  // (viii) Set-asides add up (item 10, e47): the set-aside rows plus the pool equal the qualifying total.
  if (isResultLike && Number.isFinite(Number(d.qualifyingTotal)) && Array.isArray(d.setAsideRows)) {
    const poolN = Number.isFinite(d.poolN) ? d.poolN : rawPool.length;
    const ok = poolN + d.setAsideRows.length === Number(d.qualifyingTotal);
    add("set_asides_add_up", ok, ok ? `pool ${poolN} + set aside ${d.setAsideRows.length} = qualifying ${d.qualifyingTotal}` : `pool ${poolN} + set aside ${d.setAsideRows.length} != qualifying ${d.qualifyingTotal}`);
  } else {
    add("set_asides_add_up", true, "no qualifying total on this answer");
  }
  // (ix) ZERO-COUNT OPTIONS ARE NEVER SHOWN (e51, Sam's decision): every option an answer offers (variant option
  // line, variant choice, body or trim identity options) carries at least one sale, and no option is the generic
  // restoration entry.
  {
    const offered = [];
    for (const e of (Array.isArray(d.variantOptionsLine) ? d.variantOptionsLine : [])) { if (e && e.key === "restoration") offered.push({ what: "restoration option line", n: -1 }); for (const o of (e && e.options) || []) offered.push({ what: `variant ${o.label}`, n: Number(o.n) }); }
    for (const c of (Array.isArray(d.variantChoices) ? d.variantChoices : [])) offered.push({ what: `variant choice ${c.label}`, n: Number(c.count) });
    for (const o of (Array.isArray(d.bodyOptions) ? d.bodyOptions : [])) if (o && typeof o === "object") offered.push({ what: `body ${o.label}`, n: Number(o.n) });
    for (const o of (Array.isArray(d.trimOptions) ? d.trimOptions : [])) if (o && typeof o === "object") offered.push({ what: `trim ${o.label}`, n: Number(o.n) });
    const bad = offered.filter(o => !(o.n >= 1));
    add("no_zero_count_options", bad.length === 0, bad.length ? `offered with no sale: ${bad.map(o => o.what).join(", ")}` : (offered.length ? `${offered.length} option(s), every one with a sale` : "no options on this answer"));
  }
  // (vi) The label never names a wider span of years than the receipts cover (Sam, Oct 14 2026, golden
  // car 12): a "{a} to {b}" label must sit inside the pool's own years, a "({code} generation)" label
  // must have receipts reaching both ends of the generation (d.genYears), and an exact-rung label's
  // leading year must be the only year in the pool.
  if (isResultLike && onOwnPool && rawPool.length) {
    const ys = rawPool.map(r => Number(r.year)).filter(Number.isFinite);
    const label = String(d.rungLabel || "");
    if (ys.length) {
      const lo = Math.min(...ys), hi = Math.max(...ys);
      const span = /\b((?:19|20)\d\d) to ((?:19|20)\d\d)\b/.exec(label);
      const gen = /\(([^()]+) generation\)/.exec(label);
      const lead = /^((?:19|20)\d\d)\s/.exec(label);
      if (span) {
        const a = Number(span[1]), b = Number(span[2]);
        add("label_span_within_receipts", a >= lo && b <= hi, a >= lo && b <= hi ? `label ${a} to ${b} inside receipts ${lo} to ${hi}` : `label names ${a} to ${b} but the receipts cover ${lo} to ${hi}`);
      } else if (gen) {
        const gy = Array.isArray(d.genYears) ? d.genYears : null;
        const ok = !!(gy && lo <= gy[0] && hi >= gy[1]);
        add("label_span_within_receipts", ok, ok ? `generation label ${gy[0]} to ${gy[1]} spanned by receipts ${lo} to ${hi}` : `generation label names ${gy ? gy[0] + " to " + gy[1] : "an unknown span"} but the receipts cover ${lo} to ${hi}`);
      } else if (lead && d.fallbackRung === "exact") {
        const y = Number(lead[1]);
        add("label_span_within_receipts", lo === y && hi === y, lo === y && hi === y ? `exact label ${y} matches the receipts` : `exact label names ${y} but the receipts cover ${lo} to ${hi}`);
      } else {
        add("label_span_within_receipts", true, "label names no span of years");
      }
    } else {
      add("label_span_within_receipts", true, "receipts carry no year to check");
    }
  } else {
    add("label_span_within_receipts", true, "no receipts to check (tier=" + d.tier + ")");
  }
  return out;
}
// THE call: runs the engine once, times it, maps the tier. Same signature as runOneBox so every
// existing call site swaps in with no argument changes. `.raw` carries runOneBox's full answer
// unchanged, for any caller (Market Check today) that still needs the rich object alongside the
// standard fields - this function adds the standard shape, it does not remove the rich one.
// TYPED-MODEL GUARD (e64, Sam): when the words typed name a DIFFERENT car of the same make than the one resolved (the
// "carrera gt" in "2004 Porsche Carrera GT" read as a 911), the answer is the engine's refusal and never a range. The
// names are the curated model names and their aliases (lib/vehicleData.js MODEL_ALIASES and MODEL_OWNERSHIP), only the
// distinctive ones (two words or more, or a code with a digit), matched as whole words, and only when that named car is
// neither the resolved model nor inside the resolved model and trim. A safety net behind the resolver, not a second rule.
import { MODEL_ALIASES as OB_MODEL_ALIASES, MODEL_OWNERSHIP as OB_MODEL_OWNERSHIP } from "./vehicleData.js";
const obSquash = t => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// e68: Sam's line for a car that is never compared (one constant, so his approved wording drops in here and nowhere else).
// PENDING SAM'S APPROVAL: the wording below is the placeholder Lane F proposed (option B); e68 does not ship until he approves.
export const BUILDER_CAR_LINE = "Singer cars are not compared with standard 911s. Sam shows no range for this car.";
export function isSingerPorsche(searchText, vehicle) {
  const v = vehicle || {};
  return /porsche/i.test(String(v.make || "")) && /\bsinger\b/i.test(String(searchText || ""));
}
export function typedModelMismatch(searchText, vehicle) {
  const v = vehicle || {}; if (!v.make || !v.model) return null;
  const text = " " + obSquash(searchText) + " ";
  const mk = obSquash(v.make), resolved = obSquash(v.model), resolvedFull = obSquash([v.model, v.trim].filter(Boolean).join(" "));
  const names = [];
  for (const a of OB_MODEL_ALIASES || []) if (a && a.model && obSquash(a.make) === mk) names.push({ name: obSquash(a.alias), model: a.model });
  for (const o of OB_MODEL_OWNERSHIP || []) if (o && o.model && (o.makes || []).some(m => obSquash(m) === mk)) { names.push({ name: obSquash(o.model), model: o.model }); for (const al of (o.aliases || [])) names.push({ name: obSquash(al), model: o.model }); }
  for (const n of names) {
    if (!n.name || !(n.name.includes(" ") || /\d/.test(n.name))) continue;          // distinctive names only
    const m = obSquash(n.model);
    if (m === resolved || resolvedFull.includes(m) || resolved.includes(m)) continue; // it IS the resolved car
    // e65 (Lane C's live check, "2026 Lexus LC 500"): a named model that is the resolved model plus a three-digit badge (LC 500
    // inside LC, RC 350 inside RC) is a version of the resolved car, not a different car. GT40 vs GT (two digits) still refuses.
    if (new RegExp(`^${resolved.replace(/[^a-z0-9 ]/g, "").replace(/ /g, " ?")} ?\\d{3}[a-z]?$`).test(m)) continue;
    if (!text.includes(" " + n.name + " ")) continue;
    // e65 (the 2004 Ferrari 360 Challenge Stradale before read): a named model typed right in front of the resolved model is
    // its parent ("360 Challenge Stradale" resolves to Challenge Stradale), not a different car.
    if (text.includes(" " + n.name + " " + resolved + " ")) continue;
    if (resolvedFull.split(" ").length >= n.name.split(" ").length && resolvedFull.includes(n.name)) continue;
    return { typed: n.name, namesModel: n.model, resolvedModel: v.model };
  }
  return null;
}
// SINGLE FLIGHT (Sam, Oct 18 2026): identical in-flight reads (same engine version, same resolved car, same generation,
// same refine, same ask, same exact-sale comparison) share ONE compute in this instance; later callers wait on the first
// and return its result. A failure or a deadline is shared too, and nothing is stored from it (every store happens in
// the caller after a successful answer). No per-product logic: Market Check, Sell, the demo's three page reads, Buy and
// Tasks all enter here. The warm's direct runOneBox call is its own compute by design (it writes the stored row).
const inflightRuns = new Map();
function singleFlightKey(vehicle, generation, env, refine) {
  const v = vehicle || {};
  const es = env && env.exactSale ? (env.exactSale.id || env.exactSale.source_id || env.exactSale.vin_norm || JSON.stringify(env.exactSale).slice(0, 80)) : null;
  return JSON.stringify([ENGINE_VERSION, v.make || null, v.model || null, v.trim || null, v.year || null, v.bodyStyle || null, v.vin || null, v.chassis || null,
    v.edition || null, v.variant || null, v.wheelbase || null, v.series || null, v.trimNumber || null, generation && generation.code || null,
    refine || null, (env && Number(env.asked)) || 0, es]);
}
export async function oneEngineAnswer(vehicle, generation, searchText, env, refine) {
  const t0 = Date.now();
  const key = singleFlightKey(vehicle, generation, env, refine);
  let run = inflightRuns.get(key);
  const shared = !!run;
  if (!run) {
    run = runOneBox(vehicle, generation, searchText, env, refine).finally(() => { if (inflightRuns.get(key) === run) inflightRuns.delete(key); });
    inflightRuns.set(key, run);
  }
  let d = await run;
  if (shared && d && typeof d === "object") d = { ...d, sharedFlight: true };   // diagnostic only, never rendered
  // FAILED READ (e64, Sam's most important item): a pool read that did not complete is NEVER "not tracked", never a
  // range and never a count. It retries ONCE while the request clock allows (env.deadlineAt when the caller passes
  // one, else the 20 s bound from this call), then answers with the engine's still-reading line. That answer is
  // tier "unavailable", which no stored-answer path writes (answerCacheable rejects it, warmDemo stores only full
  // tiers, refreshDemoAnswer stores only a full result).
  // TYPED-MODEL GUARD (e64): a range for a car other than the one typed is never shown
  const mismatch = (d && /^(result|thin|refusal)$/.test(String(d.tier || ""))) ? typedModelMismatch(searchText, vehicle) : null;
  if (mismatch) d = { ...d, tier: "refusal", refusal: { kind: "invariant_failed", failedChecks: ["typed_model_mismatch"], typed: mismatch.typed, namesModel: mismatch.namesModel }, samLine: "Sam could not verify this one, so no figures are shown.", poolN: 0, soldCount: 0, soldCountN: 0, cards: [], rawPool: [], recent3: [], cluster: null, span: null, fallbackRung: "not_enough_data" };
  // e68 (Sam, Oct 19 2026): A SINGER CAR IS NEVER COMPARED. Words that carry the Singer Vehicle Design mark on a Porsche
  // ("1992 Porsche 911 Carrera 4 by Singer", "Reimagined by Singer") get the no-comparison answer on every product: no
  // range, no count, no sales list, only BUILDER_CAR_LINE. Singer only (Sam named Singer; other builders keep today's
  // pool-side handling). A Singer Gazelle (the British make) never matches: the mark is read on a Porsche only.
  if (d && typeof d === "object" && isSingerPorsche(searchText, vehicle)) {
    d = { tier: "refusal", refusal: { kind: "builder_car", builder: "Singer" }, samLine: BUILDER_CAR_LINE, poolN: 0, soldCount: null, soldCountN: 0,
      cluster: null, span: null, cards: [], rawPool: [], lowestSaleN: null, highestSaleN: null, wideSpread: false, rungLabel: null,
      resolvedCar: d.resolvedCar || null, readAt: d.readAt || null };
  }
  const failed = x => x && typeof x === "object" && (x.tier === "read_failed" || (x.dedup && x.dedup.queryError && x.tier === "not_tracked"));
  if (failed(d)) {
    const deadlineAt = Number(env && env.deadlineAt) > 0 ? Number(env.deadlineAt) : t0 + Number(process.env.ONEBOX_DEADLINE_MS || 20000);
    if (deadlineAt - Date.now() > 4000) {
      try { d = await runOneBox(vehicle, generation, searchText, env, refine); } catch (e) { d = { tier: "read_failed" }; }
    }
    if (failed(d)) d = { tier: "unavailable", stillReading: true, readFailed: true, samLine: "Sam is still reading the sales for this one.", retry: true, retryAfterMs: 15000, resolvedCar: d && d.resolvedCar || null };
  }
  // e60: readAt on EVERY tier (a thin or refusal answer returned before the result stamp carried none)
  if (d && typeof d === "object" && !d.readAt) d.readAt = new Date().toISOString();
  // OUTPUT-INVARIANT GATE (Part 4 golden-cars job, Oct 2026): the five checks above are each
  // documented as true BY CONSTRUCTION for a correctly-working ladder - a failure means something is
  // actually wrong with THIS answer (a corrupted pool, a mislabeled rung, a sibling escaping its own
  // gate), never a borderline judgment call. Showing it anyway would be the exact kind of invented/
  // unverified claim rule 1 and rule 25 exist to prevent, so it is withheld - the honest "not enough
  // data" floor, never silently served. Logged loudly (never swallowed) so a real regression is
  // immediately visible, not just invisibly downgraded.
  // e67 part (b) (Sam, the 1988 M3 Evolution, 1990 Sport Evolution, 1995 Lightweight and GT): a CURATED trim of the model
  // (its modelRules generation lists the trim) that has no sales of its own reads the year's pool, and the label says so,
  // so the reader sees what was read ("1995 M3 sales; no Lightweight on record separately"). Only a curated trim the
  // engine dropped (the label does not name it) on a fallback rung; every other answer is untouched.
  if (d && /^(result|thin)$/.test(String(d.tier || "")) && vehicle && vehicle.trim && d.fallbackRung && d.rungLabel) {
    const tTok = String(vehicle.trim).split(/\s+/)[0];
    const named = titleHasToken(String(d.rungLabel), tTok) || (d.resolvedCar && titleHasToken(String(d.resolvedCar.trim || ""), tTok)) || titleHasToken(String(d.scopeLabel || ""), tTok);
    const curated = (() => { const r = mrRulesFor(vehicle.make, vehicle.model); return !!(r && mrBodiesForTrim(r, vehicle.trim, null)); })();
    if (!named && curated) d = { ...d, rungLabel: `${d.rungLabel} sales; no ${vehicle.trim} on record separately` };   // the wording Sam approved
  }
  if (d && /^(result|thin)$/.test(String(d.tier || ""))) {
    const checks = runOutputInvariants(d, vehicle);
    const failed = checks.filter(c => !c.ok);
    if (failed.length) {
      try { console.error(JSON.stringify({ tag: "output_invariant_failed", q: searchText, vehicle: { make: vehicle?.make, model: vehicle?.model, trim: vehicle?.trim, year: vehicle?.year }, tier: d.tier, failed: failed.map(c => ({ name: c.name, detail: c.detail })) })); } catch {}
      d = { ...d, tier: "refusal", ladderStep: d.ladderStep || null, refusal: { kind: "invariant_failed", failedChecks: failed.map(c => c.name) }, samLine: "Sam could not verify this one, so no figures are shown.", poolN: 0, soldCount: 0, soldCountN: 0, cards: [], rawPool: [], recent3: [], cluster: null, span: null, fallbackRung: "not_enough_data", referenceFigure: null, referenceFigureReason: "the engine's own answer failed an internal consistency check, so nothing is shown rather than risk a wrong one" };
    }
  }
  const latencyMs = Date.now() - t0;
  return { raw: d, ...mapEngineAnswer(d, latencyMs) };
}
export async function runOneBoxModelChoice(vehicle, env) {
  const make = (vehicle && vehicle.make) || "";
  if (!make) return null;
  const year = Number(vehicle && vehicle.year) || null;
  // Bare make (no year): offer the most-SOLD models by archive count (up to 8), deduped to base models.
  if (!year) {
    const top = await topModelsForMake(env, make, 8);
    if (top.length) {
      const resolvedCar0 = { year: null, make, model: null, trim: null, bodyStyle: null, transmission: null };
      return { tier: "model_choice", resolvedCar: resolvedCar0, prompt: `Which ${make} model?`, modelOptions: top };
    }
  }
  // Use the SAME chip builder the resolver's clarification path uses, so One Box and /sell
  // never diverge on the model list. The old One Box path ranked ALL archive models by raw
  // count over a wide year window, which let mainstream nameplates crowd the M3 out of the
  // top 6 for a 2020 BMW VIN; the shared builder ranks a curated model set by recent sales,
  // so enthusiast models like M3 surface. A missing chip is still recoverable via free text.
  const chips = await modelChipsForMakeYear(env, make, year);
  const models = (chips || []).filter(c => c && !/^not sure$/i.test(c) && !isBodyStyleEnumModelName(c));
  if (!models.length) return null;
  const resolvedCar = { year: year || null, make, model: null, trim: null, bodyStyle: null, transmission: null };
  return {
    tier: "model_choice", resolvedCar,
    prompt: `Which ${make} model?`,
    modelOptions: models.slice(0, 8)
  };
}
// Empty-state proof line (One Box storefront): a few genuinely recent REAL online sales
// with photos, for the rotating "A 1988 BMW 325i brought $18,500 on Bring a Trailer
// [when]" line. Online-only (no house premium ambiguity in a one-line proof), photo
// required (so the storefront thumbnails are real), newest first. Read-only, no writes.
export async function runOneBoxProof(env, limit = 8) {
  const cols = "price,auction_end_date,source,year,make,model,raw_title," +
    "image:raw_record->>featured_image_url,currency:raw_record->>currency," +
    "url:raw_record->>source_url,url2:raw_record->>url,url3:raw_record->>listing_url";
  const sinceIso = new Date(Date.now() - 21 * DAY).toISOString().slice(0, 10);
  const q = `vehicle_market_records?select=${cols}` +
    `&auction_status=ilike.sold&price=not.is.null&year=not.is.null&make=not.is.null` +
    `&raw_record->>featured_image_url=not.is.null` +
    `&source=in.(bringatrailer,carsandbids)` +
    `&auction_end_date=gte.${sinceIso}&order=auction_end_date.desc&limit=200`;
  const rows = dedupBySaleIdentity((await supabaseSelect(env, q)) || []);
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const price = Number(r.price);
    if (!(price > 0) || !r.image) continue;
    const key = `${r.year} ${r.make} ${r.model}`.toLowerCase();
    if (seen.has(key)) continue;                 // one per nameplate so the rotation varies
    seen.add(key);
    out.push({
      year: Number(r.year) || null, make: String(r.make || "").trim(),
      model: String(r.model || "").trim(), price: Math.round(price),
      platform: platformName(r.source), date: r.auction_end_date || null, image: r.image || null,
      url: r.url || r.url2 || r.url3 || null   // receipt link for the JUST SOLD line
    });
    if (out.length >= limit) break;
  }
  return { proof: out };
}

// Guard the model chips against a junk enum "model" ("Sedan, Convertible, & Wagon").
function isBodyStyleEnumModelName(name) {
  const toks = String(name || "").toLowerCase().replace(/[^a-z]+/g, " ").split(/\s+/).filter(Boolean);
  const words = new Set(["sedan", "saloon", "convertible", "cabriolet", "cabrio", "coupe", "coup", "wagon", "estate", "hatchback", "fastback", "hardtop", "and", "or"]);
  return toks.length >= 2 && toks.every(t => words.has(t));
}

// ---- Test surface (additive, non-rendering): exposes the pure range-ladder helpers so the local
// proof harness (scripts/rangeLadderCheck.mjs) can assert the rules with synthetic rows, zero DB.
export const __rangeLadderTest = {
  rangeTierForCount, roundStep, roundNearest, roundFloor, roundCeil,
  percentile, r4Cluster, r4Span, enforceSamsTake, samsTake, stPlainClause, DISPLAY_FLOOR,
  siblingFor, VT_CAR
};
// Spec-page data layer (lib/specPages.js) reuses the gearbox classifier, the hammer-USD per row, the
// recent-sale shaper and the 12-month window helper, so the public spec pages read the SAME numbers as
// One Box. Internal surface, not a public API.
// outcomeUsd (Part 3 golden-cars job, Oct 2026): re-added after e23 removed it as dead code - the new
// poolrows ops task (api/usageDashboard.js, docs/lane-notes.md FOR LANE B spec) needs the SAME
// all-in-USD figure the engine's own cards use, never a second computation.
export const __specEngine = { gearboxType, hammerUsd, outcomeUsd, mileageInfo, titleOf, monthYear, percentile, r4Cluster, r4Span, roundFloor, roundCeil, DISPLAY_FLOOR, VT_CAR, RANGE_THRESHOLD };
