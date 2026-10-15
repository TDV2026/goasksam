// Cross-product engine check (Oct 2026, Lane B). Read-only, zero writes, zero OldCarsData spend
// (archive-only). Proves Buy, Sell, Market Check and Tasks read the SAME shared-archive pool for
// the same car, by calling the exact server-side functions each product calls - not a second,
// hand-rolled implementation of any of them.
//
// NAMING NOTE: Sam's instruction named this file scripts/engineCheck.js, but that path already
// held a different, still-live tool (Oct 6, "Sweep batch 1 followup") - a Puppeteer harness that
// checks One Box vs /sell vs Desk agreement on resolvedCar/tier/halo-exclusion against the
// deployed site, with its own Shelby Cobra/halo-family regression rows. That file is untouched.
// This one lives at scripts/crossProductCheck.js instead.
//
//   node scripts/crossProductCheck.js                 run the built-in 20-spec list, print the table
//   node scripts/crossProductCheck.js --specs="a|b"    run a custom pipe-separated spec list
//   node scripts/crossProductCheck.js --json           machine-readable output (for the ops task)
//
// Exit code 1 on any MISMATCH row (CI/nightly-friendly); 0 when every spec matches across lanes.
//
// THE FOUR LANES, each calling the real product's own function (not a copy):
//   Market Check - lib/onebox.js runOneBox(), the One Box engine every Market Check search runs.
//   Buy          - lib/live/search.js familyMarket() -> listingMarket() -> walkLadder()/coreOf(),
//                  the SAME empty-state market read api/buySearch.js calls when a search has no
//                  live matches right now (the common case for a fixed, non-live spec).
//   Sell         - lib/platformPick.js fetchOnlinePool(), the shared archive pool
//                  buildSharedAnalysis() (the SELL_PICK_SHARED cutover, Oct 2026) aggregates from.
//   Tasks        - lib/tasks/tasks.js imports runSearch() from lib/live/samChat.js for LIVE-listing
//                  matching (a different kind of pool - cars for sale RIGHT NOW, not sold comps),
//                  and itself carries no separate sold-comps read. When a Tasks search has no live
//                  match (the common case here too), Buy's own empty-state falls back to the SAME
//                  familyMarket() this script already calls for the Buy lane - so "Tasks' match
//                  pool" is tested as that same shared fallback, which is what a Tasks notification
//                  would show for context. This is documented, not hidden: if Tasks ever grows its
//                  own sold-comps read, point this lane at it instead.
//
// ABROAD RULE: isAbroadRow() (lib/live/search.js) is the ONE exported function Buy, Tasks and
// Market Check's live panel all import for hiding non-US live listings - verified here by import
// grep (a single shared function has no per-product value to diverge on) plus one live
// liveForFamily() call per spec, reported as a data point (total live matches found vs abroad-
// hidden), not a MATCH/MISMATCH field (there is only one implementation to call).

import { resolveVehicle } from "../lib/vehicle.js";
import { findGeneration } from "../lib/generations.js";
import { runOneBox, buildSpec, titleFenceReason, TIER_DIMENSION, isQualifying, oneEngineAnswer, runOutputInvariants } from "../lib/onebox.js";
import { resolveSellCar, placesFor } from "../lib/sell/sellFacts.js";
import { familyMarket, liveForFamily, emptyFilters, resolveForBuy, engineAnswer, specKeyFor, warmAnswerKeyFor } from "../lib/live/search.js";
import { converse } from "../lib/live/converse.js";
import { fetchOnlinePool, buildSharedAnalysis, pickPlatform, depthWins } from "../lib/platformPick.js";
import { decide, getSellerCriteria } from "../api/sellerDecision.js";
import fs from "node:fs";
import { hammerUsd } from "../lib/_houseComps.js";
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";
import { isMemorabilia } from "../lib/_classify.js";

export const DEFAULT_SPECS = [
  "2008 Porsche 911 Carrera", "2009 Porsche 911 Carrera S Coupe", "1995 Porsche 993 Carrera",
  "1967 Ford Mustang Fastback", "1990 Chevrolet Corvette ZR-1", "1969 Chevrolet Camaro Z28",
  "2016 Ford Mustang Shelby GT350", "2006 Mercedes-Benz CLK DTM", "1990 Lamborghini Countach",
  "2000 Porsche Boxster S", "2012 BMW M3 Competition Coupe", "2022 BMW M3 Competition",
  "1973 Porsche 911 Carrera RS", "1989 Porsche 911 Speedster", "2024 Porsche 911 GT3",
  "2019 Porsche 911 Turbo S", "1965 Shelby Cobra", "1970 Datsun 240Z", "1991 Acura NSX",
  "2005 Ford GT",
  // Grown from 20 to 42 (Oct 2026 follow-up, item 5) - every car named in that round's report
  // (the Targa/M3/Speedster drawer-vs-card cases, and the curated-trim-list audit's Targa/
  // Roadster/Spider cross-make checks) plus a broader, deliberately mixed common/thin/trim-
  // sensitive set, per the item's own instruction. continue-on-error stays on (not turning the
  // nightly step red yet, per the ask) - a bigger list means more surface for a genuine, worth-
  // triaging mismatch to surface, not a new gate.
  "1988 Porsche 911 Carrera Targa", "1973 Porsche 911 Targa", "1990 Porsche 911 Targa 4",
  "1963 Chevrolet Corvette Roadster", "1957 BMW 507 Roadster", "1989 Mazda Miata Roadster",
  "1967 Shelby Cobra Roadster", "1961 Jaguar E-Type Roadster", "1955 Mercedes-Benz 300SL Roadster",
  "1985 Ferrari 308 GTS Spider", "1964 Porsche 356 Speedster", "1996 Porsche Boxster Spyder",
  "1963 Jaguar E-Type Series 1", "2015 Porsche Cayman GT4", "1970 Plymouth Barracuda",
  "1969 Dodge Charger R/T", "1972 Datsun 240Z", "2017 Ford GT", "1993 Mazda RX-7",
  "2021 Chevrolet Corvette Z06", "1988 BMW M3", "2023 Porsche 911 GT3 RS",
  // Grown again (Oct 2026, "one parser" follow-up item 3) - compound trim+body phrases from the
  // refine911 fix's own sweep ("1988 Porsche 911 Carrera Targa" above was the named regression;
  // these extend the same drivetrain-trim + body-hint pattern across more generations and body
  // words, so a future regression on this exact class surfaces here first). continue-on-error
  // stays on, per the ask - not a new gate yet.
  "1987 Porsche 911 Carrera Cabriolet", "2008 Porsche 911 Carrera S Cabriolet",
  "1989 Porsche 911 Turbo Targa", "2017 Porsche 911 Turbo S Cabriolet",
  "1986 Porsche 911 Carrera Speedster", "1991 Porsche 911 Carrera 4 Targa",
  "2015 Porsche 911 Carrera GTS Cabriolet", "1993 Porsche 911 Carrera RS Targa",
  "2001 Porsche 911 Carrera 4S Cabriolet",
  // "Carrera T Coupe"/"Carrera T Cabriolet" were dropped (Oct 2026): Carrera T did not exist until
  // 2018 and has never been sold as a Cabriolet, so those two tested a car that never existed, not a
  // resolver case. Replaced with two genuine compounds in generations the list did not cover yet.
  "2018 Porsche 911 Carrera T Coupe", "2013 Porsche 911 Carrera 4S Cabriolet",
  // Half-generation job (Oct 2026): one spec per side of each case the owner decided on
  // (lib/generations.js HALF_GENERATIONS). A SPLIT model (987 Boxster: each half must resolve to
  // its OWN narrower window, never the merged 2005-2012 span) and two MERGED models whose context
  // cards now prefer same-half sales but whose range/count must still match across all four lanes
  // exactly as before (997 Carrera S, E46 M3 pre/post facelift).
  "2006 Porsche Boxster Convertible", "2010 Porsche Boxster Convertible",
  "2008 Porsche 997 Carrera S Coupe", "2010 Porsche 997 Carrera S Coupe",
  "2001 BMW M3 Coupe", "2005 BMW M3 Coupe",
  // Trim-isolation job (Oct 2026): a bare suffix-shaped trim ("S") pooled the whole model
  // regardless of trim until qualifyReason's titleContains check was fixed (backwards substring-
  // first priority, no guard against a longer compound trim like "Turbo S"/"GTS" also satisfying
  // the match). These two have no dedicated SUBTRIM_FENCES entry (unlike 911), so they are the
  // real regression cases for the generic fallback path, not the fenced one.
  "2008 Porsche Boxster S", "2009 Porsche Cayman S",
  // Job 9 (body words on typed cars, Oct 2026): a typed body word reported dropped between Market
  // Check and Buy - traced to lib/vehicle.js BODY_STYLE_WORDS missing "sedan"/"wagon" entirely (now
  // fixed), so a free-text "Sedan"/"Wagon" resolves to vehicle.bodyStyle and every lane scopes the
  // same way. The Bronco case showed no live mismatch when checked (a prior Buy-panel staleness
  // artifact, already self-healing on refresh); kept here as a standing regression guard for both.
  "1991 BMW 3-Series Sedan", "2022 Ford Bronco",
  // Widened-year job (Oct 2026, one-pool-for-widened-years): the EXACT regression case Lane C
  // found (2017 Porsche 911 Carrera S Coupe - a car whose "recent" 12-month pool sits right at the
  // useRecent >= 8 solid-sales threshold, so a stale cached answer and a fresh one can land on
  // different windows) plus a 997.1/997.2-boundary adjacent-year pair (2008 is already in the list
  // above; 2009 added here so the two sit on opposite sides of the 2008/2009 line specifically,
  // not just somewhere within each half) and three further thin/rare specs chosen to exercise
  // year-widening (low annual volume, likely to need more than the exact year to clear threshold).
  "2017 Porsche 911 Carrera S Coupe", "2009 Porsche 997 Carrera S Coupe",
  "1973 Ferrari Dino 246 GT", "1991 Nissan 300ZX Turbo", "2001 Acura Integra Type R",
  "1989 Alfa Romeo Spider",
  // URGENT family-name resolver job (Oct 2026): "SL-Class" and other Mercedes family-head queries
  // defragment real badge-titled sales (SL500/SL63/AMG SL43 etc. - lib/modelFamilies.js) via
  // familyBadgeMatch/titleModelTokens - a title that says "Mercedes-AMG" instead of "Mercedes-Benz"
  // (AMG is Mercedes' own performance division, never a separate make) defeated the make-prefix
  // strip and fell through to class-era, showing unrelated vans/SUVs as "this car's market" (a
  // Sprinter, a G580). Regression guard for the fixed resolver gap and the tightened class-era
  // truck/van/SUV fence (TRUCK_CLASS_RE now catches Mercedes SUV badges and Sprinter by name, not
  // just the literal words "van"/"suv"/"g-wagen").
  "2023 Mercedes-Benz SL-Class", "2015 Mercedes-Benz E-Class", "2018 Mercedes-Benz G-Class",
  // URGENT CLK DTM job (Oct 2026): "2005 Mercedes-Benz CLK DTM" is the class-era pool-swap
  // regression case (see checkUrgentOct2026Guards, CLASS_ERA_MIN=500 - the real population reads
  // in the thousands; the old bug swapped it for a 13-sale keyword-only match on the car's own
  // name). "Merkur XR4Ti" is the upstream-mislabel contamination case (one BaT listing, a real
  // 1987 Ford Sierra RS Cosworth, carried OldCarsData's own make="Merkur"/model="XR4Ti" tag;
  // corrected in the archive via task=fixMerkurRow - guarded here so a future re-ingest or a
  // similar mislabel never silently re-contaminates this nameplate's pool).
  "2005 Mercedes-Benz CLK DTM", "Merkur XR4Ti",
  // Round 5 Lane B job (Oct 2026, model-first ladder): Sam's own named sweep additions. "2025
  // Porsche 911" (bare, no body named, must ask body_choice if 2+ bodies independently meet THIN)
  // and "2025 Porsche 911 Cabriolet" (body already named, must NOT ask) prove the body-choice gate.
  // "1991 Mercedes-Benz 560SL" is a thin SL-Class year with a real named sibling family (R107/R129
  // SLs) and no generation curated for the pre-1989 R107. "2021 Land Rover Defender 110" has no
  // curated generation data at all (lib/generations.js) and no SIBLING_MODELS entry - the
  // fallbackRung should skip "generation"/"sibling" cleanly rather than guess.
  "2025 Porsche 911", "2025 Porsche 911 Cabriolet", "1991 Mercedes-Benz 560SL", "2021 Land Rover Defender 110",
  // Part 2 job (Oct 2026): "2025 Porsche 911" was ALREADY in this list, and count is already an
  // EXACT-match field (compareField, not the 10%-tolerance low/high use) - the 42-vs-30 drift it
  // missed was a TIMING issue (see checkSpecKeyYearIsolation above for the real, structural guard),
  // not a gap in this list. Added anyway per the brief's explicit instruction, plus its narrower
  // golden-rules sibling so both year-widened golden cars (docs/golden-rules.md 1 and 2) are
  // standing cross-product regressions, not just engine-vs-golden ones.
  "2024 Porsche 911 Carrera S Coupe",
  // Lane B job, Oct 13 2026 (Job 1): the two cars the e28-e30 output gate wrongly refused (archive model
  // column "Grand National - Regal" read as a wrong car; one stray 365 in a 14-sale 275 pool hid the other
  // thirteen). Permanent regression specs: all four lanes must give the range golden-rules.md expects.
  "1987 Buick Regal Grand National", "1967 Ferrari 275 GTB/4 NART Spider", "2008 997 Carrera S Coupe", "2023 BMW M3", "1964 Ferrari 275 GTB",
  // Lane B job (Oct 2026, Part 2): the parseQuery edition-word gaps B2 found and listed in
  // scripts/resolverLanesCheck.mjs's buyGap entries (now closed, entries removed there too) -
  // "Black" in "Black Series" read as a paint colour and "Speedster" as a body filter BEFORE the
  // resolver ever saw them, so Buy/Tasks searched a different car than Market Check for the same
  // typed words. These four must match across all four lanes now that parseQuery protects both
  // phrases before colour/body stripping runs.
  "2008 Mercedes-Benz CLK 63 AMG Black Series", "2013 Mercedes-Benz SLS AMG Black Series",
  "Mercedes-Benz SLS AMG Black Series", "2011 Porsche 911 Speedster"
];

const round = n => (Number.isFinite(n) ? Math.round(n) : null);

// Normalizes any lane's "last three" into {date, title, price} for comparison - dates are what
// matters (the same physical sale should land on the same day regardless of which lane found it).
function normRecent(list, shape) {
  return (list || []).slice(0, 3).map(c => {
    if (shape === "cards") return { date: (c.date || "").slice(0, 10), title: c.title || null, price: Number.isFinite(c.price) ? round(c.price) : null };
    if (shape === "pool") return { date: String(c.auction_end_date || "").slice(0, 10), title: String(c.rtitle || c.raw_title || "").trim() || null, price: round(c._usd) };
    return { date: null, title: null, price: null };
  });
}
function datesOf(recent) { return (recent || []).map(r => r.date).filter(Boolean); }

// ---- THE FIVE OUTPUT CHECKS (Lane B job, Oct 2026, Part 4) ----
// Pure functions of a raw runOneBox answer `d` plus the resolved `vehicle` - no env/DB needed, same
// discipline as checkDepthWinsFixtures below, so these can be unit-tested with a synthetic `d` and
// still run for real against every live sweep spec via marketCheckLane. Each returns
// {name, ok, detail}; a caller logs any ok:false entry as a violation. Most of these are already
// true BY CONSTRUCTION in lib/onebox.js (cards are shaped from the exact same array poolN counts,
// the body-mix label suffix is read off the same rawPool) - these are regression guards, an
// independent recomputation from the exposed fields, never a second copy of the engine's own
// internal helpers (classifyBody/bodyFamily/poolYearSpan are module-private in onebox.js and are
// deliberately NOT reimplemented here; a parallel reimplementation could drift from the real one
// and manufacture false mismatches - these checks stay to what the exposed fields can prove safely).
// THE FIVE OUTPUT CHECKS now live in lib/onebox.js (runOutputInvariants) - Part 4 golden-cars job,
// Oct 2026: the engine itself runs them on every result/thin answer (oneEngineAnswer) and downgrades
// to not_enough_data on any failure, so this sweep must read the SAME implementation, never a second
// copy that could drift from what production actually gates on. Re-exported under the old name so
// every existing caller in this file (checkOneSpec below) needs no changes.
export const checkOutputInvariants = runOutputInvariants;

// ---- Lane 1: Market Check (runOneBox direct) ----
// asked:2 (Oct 2026, one-engine-entry-point job): this lane used to call with asked:0 (a fresh
// query's FIRST read), which correctly surfaces a generation_choice/body_choice/variant_choice
// question for an ambiguous bare spec ("Shelby Cobra", "Jaguar E-Type Series 1") - but Buy/Tasks'
// own engineAnswer (lib/live/search.js) ALWAYS escalates past that question internally (it has no
// interactive UI to ask through), landing on the engine's own capped/family-default answer. That
// made this lane fail 4 of the 63 default specs with "a question, not an answer" while Buy/Sell/
// Tasks correctly matched EACH OTHER on the default they all share - a test-harness artifact (this
// lane testing a different interaction point than the other three ever can), not a real cross-
// product inconsistency. asked:2 compares all four lanes at the ONE interaction point every
// product can actually reach, which is what "one engine, one answer" means here. The *_choice
// question itself is Market Check's frontend's own concern (already live, confirmed elsewhere in
// this session) and is intentionally NOT what this harness is checking.
async function marketCheckLane(vehicle, generation, searchText, env) {
  // THE PUBLIC PATH (Oct 15 2026, the e53 Camaro split): read through oneEngineAnswer, the shared entry the public API,
  // Buy, Sell and Tasks all use, which applies the output gate; runOneBox alone had hidden a gate refusal from this lane.
  const d = (await oneEngineAnswer(vehicle, generation, searchText, { ...env, exactSale: null, asked: 2 }, null)).raw;
  if (!d || !d.tier) return { ok: false, reason: "no tier" };
  // Part 4, the five output checks: run against the raw answer before anything below reduces it.
  const outputInvariants = checkOutputInvariants(d, vehicle);
  const tier = d.tier;
  // class_era REMOVED from this allow-list (Round 5 Lane B job, Oct 2026): the tier no longer
  // exists - classEraGuarded/assessClassEra are deleted, so runOneBox never returns it.
  if (!/^(result|thin|refusal)$/.test(tier)) return { ok: false, reason: `tier=${tier} (a question, not an answer - spec needs a year/trim to disambiguate)`, identityQuestionAsked: /_choice$/.test(tier), outputInvariants };
  const label = [d.resolvedCar?.genCode, d.resolvedCar?.model, d.resolvedCar?.trim].filter(Boolean).join(" ") || vehicle.model || null;
  // Mirror lib/live/search.js marketOf() exactly: a "range" low/high exists ONLY when
  // d.tier === "result" && Array.isArray(d.cluster) (8+ solid sales, rule 24's cluster gate).
  // d.span is the full outlier-inclusive min-max, a DIFFERENT statistic Buy/Tasks never surface
  // as low/high - comparing span against Buy's cluster-sourced low/high is apples-to-oranges and
  // was producing false MISMATCH rows. Below the cluster gate, report no range (count-only), same
  // as marketOf()'s own fallback.
  const hasCluster = d.tier === "result" && Array.isArray(d.cluster);
  const low = hasCluster ? d.cluster[0] : null;
  const high = hasCluster ? d.cluster[1] : null;
  const count = d.poolN ?? (d.thin ? d.thin.n : null) ?? (Array.isArray(d.cards) ? d.cards.length : null);
  const cards = Array.isArray(d.cards) ? d.cards : [];
  const latest = cards.map(c => (c.date || "").slice(0, 10)).filter(Boolean).sort().at(-1) || null;
  const recent = normRecent(Array.isArray(d.recent3) ? d.recent3 : cards, "cards");
  const span = Array.isArray(d.span) ? [round(d.span[0]), round(d.span[1])] : null;
  // fallbackRung/rungLabel/siblingName (Round 5 Lane B job, Oct 2026, Part 1 sweep requirement):
  // read directly off the raw engine answer, same fields mapEngineAnswer exposes. identityQuestionAsked
  // is false here (this spec answered, tier is result/thin/refusal) - see the tier-mismatch branch
  // above for the question-asked case.
  return { ok: true, tier, label, low, high, count, latest, recent, span, referenceFigure: d.referenceFigure || null, counts: d.counts || null, window: d.windowLabel || null, poolYears: Array.isArray(d.poolYears) ? d.poolYears : null, fallbackRung: d.fallbackRung || null, rungLabel: d.rungLabel || null, siblingName: d.siblingName || null, identityQuestionAsked: false, outputInvariants };
}

// ---- Lane 2 & 4: Buy / Tasks (familyMarket -> listingMarket -> walkLadder, the real empty-state read) ----
async function buyLane(env, v, f) {
  const m = await familyMarket(env, v, f);
  if (!m) return { ok: false, reason: "no market read (listingMarket returned null)" };
  if (m.kind === "pending") return { ok: false, reason: "pending (spec_market_cache miss, engine call in flight)" };
  const label = m.short || m.family || null;
  const low = m.kind === "range" ? m.low : (m.span ? m.span[0] : null);
  const high = m.kind === "range" ? m.high : (m.span ? m.span[1] : null);
  const count = m.count ?? null;
  const recent = normRecent(m.recent, "cards");
  const latest = datesOf(recent).sort().at(-1) || null;
  return { ok: true, kind: m.kind, label, low, high, count, latest, recent, referenceFigure: m.referenceFigure || null, counts: m.counts || null, window: m.windowLabel || null, poolYears: Array.isArray(m.poolYears) ? m.poolYears : null, fallbackRung: m.fallbackRung || null, rungLabel: m.rungLabel || null, siblingName: m.siblingName || null };
}

// ---- Lane 3: Sell (fetchOnlinePool, the shared pool buildSharedAnalysis aggregates from) ----
async function sellLane(vehicle, generation, env) {
  const { spec, pool, cluster, referenceFigure, recent3, windowLabel, poolYears } = await fetchOnlinePool(vehicle, generation, env);
  if (!spec) return { ok: false, reason: "no spec (vehicle did not resolve to a buildable spec)" };
  if (!pool.length) return { ok: false, reason: "empty pool (genuinely zero online sales on record)" };
  const priced = pool.map(r => ({ ...r, _usd: Number.isFinite(r._usd) ? r._usd : hammerUsd(r) })).filter(r => Number.isFinite(r._usd) && r._usd > 0);
  if (!priced.length) return { ok: false, reason: "pool had rows but none priced" };
  const prices = priced.map(r => r._usd);
  const label = [generation?.code, vehicle.model, spec.trim].filter(Boolean).join(" ") || vehicle.model || null;
  const sorted = priced.slice().sort((a, b) => String(b.auction_end_date || "").localeCompare(String(a.auction_end_date || "")));
  // recent: read the engine's OWN deduped recent3 (lib/onebox.js lastThreeDistinct, passed through by
  // fetchOnlinePool) rather than re-sorting `pool` here - a second "most recent 3" implementation
  // disagreed with the engine's on a re-listed title (same car, two listings), see lib/platformPick.js.
  const recent = normRecent(Array.isArray(recent3) ? recent3 : sorted, Array.isArray(recent3) ? "cards" : "pool");
  // fetchOnlinePool now reads runOneBox's own ladder (Oct 2026 "one engine ladder" fix), so it
  // carries the SAME cluster band Market Check/Buy/Tasks use for low/high - prefer it here too, same
  // gate as marketOf() (lib/live/search.js): a real cluster only exists at 8+ solid sales. The
  // unclipped span is still carried (as `span`) for diagnostic context, never compared.
  const span = [round(Math.min(...prices)), round(Math.max(...prices))];
  const hasCluster = Array.isArray(cluster);
  const low = hasCluster ? round(cluster[0]) : null, high = hasCluster ? round(cluster[1]) : null;
  // Sell asking-line band (Oct 2026, ONE RANGE decision - item 4): api/sellerDecision.js's
  // decision.priceBand is now set from a FRESH, independent runOneBox call (not fetchOnlinePool's
  // own cluster above), mirrored here exactly so a future second implementation of "the asking-
  // line band" (a reintroduced priceBandForVehicle, or any other separately-scoped archive read)
  // is caught by this check even if it never touches fetchOnlinePool at all.
  const askingSearchText = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  const askingResult = await runOneBox(vehicle, generation, askingSearchText, { ...env, asked: 2 }, null).catch(() => null);
  const askingLineLow = askingResult && Array.isArray(askingResult.cluster) ? round(askingResult.cluster[0]) : null;
  const askingLineHigh = askingResult && Array.isArray(askingResult.cluster) ? round(askingResult.cluster[1]) : null;
  // counts (Oct 2026, count reconciliation job): fetchOnlinePool (lib/platformPick.js, Lane C's
  // file) does not surface runOneBox's new `counts` field, so this reuses the SAME askingResult
  // call just above (a second runOneBox invocation that already exists for the asking-line
  // verification) rather than adding a third call or editing platformPick.js.
  const counts = (askingResult && askingResult.counts) || null;
  // fallbackRung/rungLabel/siblingName (Round 5 Lane B job, Oct 2026): fetchOnlinePool
  // (lib/platformPick.js, Lane C's file) does not surface these either, same gap as counts above -
  // reuses the SAME askingResult call rather than adding a third runOneBox invocation.
  return { ok: true, label, low, high, span, count: priced.length, latest: (sorted[0]?.auction_end_date || "").slice(0, 10) || null, recent, referenceFigure: referenceFigure || null, askingLineLow, askingLineHigh, counts, window: windowLabel || null, poolYears: Array.isArray(poolYears) ? poolYears : null, fallbackRung: (askingResult && askingResult.fallbackRung) || null, rungLabel: (askingResult && askingResult.rungLabel) || null, siblingName: (askingResult && askingResult.siblingName) || null };
}

// ---- comparison ----
const pctDiff = (a, b) => (a == null || b == null || a === 0) ? (a !== b) : Math.abs(a - b) / Math.abs(a) > 0.1;
function compareField(name, values) {
  const present = Object.entries(values).filter(([, v]) => v !== undefined && v !== null);
  if (present.length < 2) return { field: name, status: "N/A", detail: "fewer than 2 lanes answered" };
  if (name === "low" || name === "high") {
    const nums = present.map(([, v]) => v);
    const mismatch = nums.some(n => pctDiff(nums[0], n));
    return { field: name, status: mismatch ? "MISMATCH" : "MATCH", detail: present.map(([k, v]) => `${k}=${v}`).join(" ") };
  }
  // count (Oct 2026, M3 Competition mismatch job): EXACT match, not the 10%-relative tolerance low/
  // high use. The sales count is a discrete pool-membership fact - the same car must give the same
  // count in every product, not "close enough". Any difference, even by 1, is a real divergence
  // (a different pool, not a rounding/estimation difference the way a price range can have).
  if (name === "count") {
    const nums = present.map(([, v]) => v);
    const mismatch = nums.some(n => n !== nums[0]);
    return { field: name, status: mismatch ? "MISMATCH" : "MATCH", detail: present.map(([k, v]) => `${k}=${v}`).join(" ") };
  }
  if (name === "latest") {
    const strs = present.map(([, v]) => v);
    const mismatch = strs.some(s => s !== strs[0]);
    return { field: name, status: mismatch ? "MISMATCH" : "MATCH", detail: present.map(([k, v]) => `${k}=${v}`).join(" ") };
  }
  if (name === "recent") {
    // Market Check's d.recent3 is ascending (oldest of the three first); Buy/Tasks' core.recent is
    // descending (most recent first) - a presentation-order difference, not a different set of
    // sales. Compare the SORTED date set so "same three sales, different order" reads as a match.
    const lists = present.map(([, v]) => datesOf(v).slice().sort().join(","));
    const mismatch = lists.some(s => s !== lists[0]);
    return { field: name, status: mismatch ? "MISMATCH" : "MATCH", detail: present.map(([k, v]) => `${k}=[${datesOf(v).join(",")}]`).join(" ") };
  }
  // window/poolYears (Oct 2026, one-pool-for-widened-years job): EXACT match, same discipline as
  // count/latest above - the engine's own window decision and year span are facts about WHICH POOL
  // was read, not a number with rounding/estimation tolerance. Lane C's reported case (2017 Porsche
  // 911 Carrera S Coupe: Market Check "last twelve months" against Buy/Tasks "past 2 years" for the
  // identical car) had a HIGH mismatch under the 10% price tolerance above, but its LOW values were
  // only ~9% apart - inside that tolerance, so the root mismatch would have passed silently without
  // this check. A window/poolYears difference is the mismatch itself, independent of what the
  // prices happen to be.
  if (name === "window" || name === "windowLabel") {
    const strs = present.map(([, v]) => String(v));
    const mismatch = strs.some(s => s !== strs[0]);
    return { field: "window", status: mismatch ? "MISMATCH" : "MATCH", detail: present.map(([k, v]) => `${k}="${v}"`).join(" ") };
  }
  if (name === "poolYears") {
    const strs = present.map(([, v]) => Array.isArray(v) ? v.join("-") : String(v));
    const mismatch = strs.some(s => s !== strs[0]);
    return { field: "poolYears", status: mismatch ? "MISMATCH" : "MATCH", detail: present.map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("-") : v}`).join(" ") };
  }
  // fallbackRung/rungLabel/siblingName (Round 5 Lane B job, Oct 2026): EXACT match, same discipline
  // as window/poolYears - these name WHICH rung/pool produced the answer, not a tolerance-bearing
  // number.
  if (name === "fallbackRung" || name === "rungLabel" || name === "siblingName") {
    const strs = present.map(([, v]) => String(v));
    const mismatch = strs.some(s => s !== strs[0]);
    return { field: name, status: mismatch ? "MISMATCH" : "MATCH", detail: present.map(([k, v]) => `${k}="${v}"`).join(" ") };
  }
  if (name === "label") {
    // Informational only - wording legitimately differs by product (plural noun, generation code
    // style). Flags a mismatch only when two labels share NO common word at all, which usually
    // means a different generation/trim scope, not just different phrasing.
    // Strip a trailing plural 's' per word (Buy/Tasks say "Countachs", Market Check says "Countach")
    // so a bare plural never reads as a different car.
    const stem = w => (w.length > 3 && w.endsWith("s")) ? w.slice(0, -1) : w;
    const norm = s => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean).map(stem));
    const sets = present.map(([, v]) => norm(v));
    const mismatch = sets.some(s => ![...s].some(w => sets[0].has(w)));
    return { field: name, status: mismatch ? "MISMATCH" : "MATCH", detail: present.map(([k, v]) => `${k}="${v}"`).join(" ") };
  }
  if (name === "referenceFigure") {
    // Business-figure item (Oct 2026): passed through unchanged from the SAME runOneBox computation
    // in every lane (lib/live/search.js coreOf, lib/platformPick.js fetchOnlinePool), never
    // recomputed per lane - comparing the amount alone is enough to prove "the same figure wherever
    // it is read", since confidence/rangeLow/rangeHigh/salesCount are derived from that same object.
    const nums = present.map(([, v]) => v && v.amount);
    const mismatch = nums.some(n => n !== nums[0]);
    return { field: name, status: mismatch ? "MISMATCH" : "MATCH", detail: present.map(([k, v]) => `${k}=${v && v.amount}(${v && v.confidence})`).join(" ") };
  }
  return { field: name, status: "N/A", detail: "" };
}

// Best-effort "why" for a mismatching spec, grounded in the actual code paths (not guessed) -
// per Sam's ask: "Print the reason where you can tell". Each reason names the file and function
// on each side so the mismatch can be assigned. Silent when no known pattern explains it.
function diagnoseReasons(row, { marketCheck, buy, sell, tasks }) {
  const out = [];
  const countMismatch = row.compare.find(c => c.field === "count" && c.status === "MISMATCH");
  const lowHighMismatch = row.compare.some(c => (c.field === "low" || c.field === "high") && c.status === "MISMATCH");
  const latestMismatch = row.compare.find(c => c.field === "latest" && c.status === "MISMATCH");

  // Market Check asked a disambiguating question instead of answering (bare nameplate, no
  // trim/generation given) while Buy/Tasks' walkLadder pooled the whole nameplate anyway.
  if (!marketCheck.ok && /tier=generation_choice/.test(marketCheck.reason || "") && (buy.ok || tasks.ok)) {
    out.push("Market Check (lib/onebox.js runOneBox, generation_choice tier) asks a disambiguating " +
      "question for this bare spec; Buy/Tasks (lib/live/search.js familyMarket->walkLadder) has no " +
      "equivalent generation-ambiguity gate and pools the whole nameplate instead of asking.");
  }

  // CORRECTED (one-resolver fix, Oct 2026): this is not two resolver implementations disagreeing on
  // the same raw text - Buy/Tasks' familyMarket already received resolveVehicle's own output (the
  // SAME function Market Check/Sell call), then used to flatten it back into
  // "[year, make, model, trim].join(' ')" and hand that STRING to resolveForBuy, which called
  // resolveVehicle a SECOND time on the lossy, re-serialized text. For compound/structured specs
  // ("CLK DTM", "Targa 4", "356 Speedster", "308 GTS Spider", "Carrera RS", chassis-form "240Z", any
  // "X Roadster") the flatten-then-reparse step lost information the FIRST resolve already had
  // correctly. Fixed by having familyMarket pass its already-resolved vehicle straight through
  // (specOf's resolvedVehicle param -> enrichForBuy, never resolveVehicle a second time). A mismatch
  // still landing on this branch after that fix is a NEW regression, not this historical class.
  if ((!buy.ok || !tasks.ok) && (marketCheck.ok || sell.ok)) {
    out.push("Buy/Tasks (lib/live/search.js specOf, via familyMarket's resolvedVehicle param) failed " +
      "to resolve this spec while resolveVehicle (lib/vehicle.js, used directly by Market Check/Sell, " +
      "and by Buy/Tasks' own first resolve) did - since the one-resolver fix this should no longer be " +
      "a lossy double-resolve; check specOf/enrichForBuy directly for what dropped the car.");
  }

  // Sell diverging on count/latest (rare after the Oct 2026 "one engine ladder" fix - fetchOnlinePool
  // now reads runOneBox's own rawPool, same rung as Market Check/Buy/Tasks): look to the resolver
  // first, since a resolved-car difference is the remaining live cause (e.g. a chassis-code genCode
  // mismatch), not a window difference - fetchOnlinePool no longer runs its own window at all.
  if (sell.ok && (marketCheck.ok || buy.ok) && (countMismatch || latestMismatch)) {
    out.push("Sell (lib/platformPick.js fetchOnlinePool) now reads lib/onebox.js runOneBox's own " +
      "rawPool directly (Oct 2026 one engine ladder fix) - a remaining count/latest mismatch here " +
      "means the RESOLVED CAR differed between calls (a generation/trim binding difference), not a " +
      "window difference. Compare each lane's resolved label/genCode by hand.");
  }

  // low/high mismatch with Sell present and no count/latest explanation already filed: Sell's
  // low/high now prefers runOneBox's own cluster (same gate as marketOf()'s d.cluster check) - a
  // mismatch here with count/latest MATCHING means the pool landed below the 8-sale cluster floor on
  // one lane's read but not another's, or this script's own cluster extraction is stale.
  if (lowHighMismatch && sell.ok && !out.some(r => r.startsWith("Sell"))) {
    out.push("Sell's low/high (lib/platformPick.js, now sourced from runOneBox's own cluster) " +
      "mismatched while count/latest agreed - check whether the landed tier actually carried a " +
      "cluster (8+ solid sales, lib/onebox.js rangeTierForCount) on every lane; a tier below that " +
      "floor has no cluster and should read null on all four, not a guessed span.");
  }

  if (!out.length && (lowHighMismatch || countMismatch)) {
    out.push("No known pattern identified from this run's data alone - worth a by-hand check (pool " +
      "membership itself may differ, not just window/statistic choice).");
  }
  return out;
}

// ---- Lane 5: /sell's own facts (lib/sell/sellFacts.js) ----
// DECISION (Lane B2, Oct 2026): sellFacts keeps its own pool read (fetchQualifying through the engine's own buildSpec
// and isQualifying) instead of going through oneEngineAnswer, because it needs the pool's ROWS split by venue (per-venue
// sales, middle half, last sale, sold-through) and oneEngineAnswer returns one range plus receipts, not the rows. So the
// invariant is asserted here, per spec, rather than assumed. What must hold for every sweep spec:
//   1. the car sellFacts sells is the car every other lane resolved (make, model, trim, body);
//   2. its venue sales add up to its own total (no venue dropped, none counted twice);
//   3. on an engine rung (exact / any_gearbox / any_body) EVERY row it counts passes the engine's own fence
//      (isQualifying on the engine's spec), so it never counts a sale the engine would set aside.
// Its window (12 then 36 months), house tier and display floor differ from the engine's answer by design, so its
// TOTAL is reported next to the engine's count but is not compared for equality.
async function sellFactsLane(q, vehicle, env, engineCount) {
  const out = { ok: true, checks: [] };
  const add = (name, ok, detail) => out.checks.push({ name, status: ok ? "MATCH" : "MISMATCH", detail });
  const sc = await resolveSellCar(q, env);
  if (!sc.car) return { ok: false, reason: "resolveSellCar found no car" };
  const a = sc.car.v, b = vehicle;
  const same = k => String(a[k] || "").toLowerCase() === String(b[k] || "").toLowerCase();
  add("car", ["make", "model", "trim"].every(same) || (String(a.model) === "911" && String(a.make) === "Porsche" && /^9\d\d$/.test(String(b.model))), `sellFacts=${a.make}|${a.model}|${a.trim || ""} resolver=${b.make}|${b.model}|${b.trim || ""}`);
  const pl = await placesFor({ ...sc.car, env: { supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey } });
  const venueSum = (pl.places || []).reduce((n, p) => n + p.sales, 0) + (pl.others || []).reduce((n, p) => n + p.sales, 0);
  add("venue sales add up", venueSum === pl.total, `venues=${venueSum} total=${pl.total}`);
  if (/^(exact|any_gearbox|any_body)$/.test(pl.step) && pl._spec) {
    const bad = (pl._pool || []).filter(r => !isQualifying(r, pl._spec));
    add("every counted sale passes the engine fence", bad.length === 0, `${bad.length} of ${(pl._pool || []).length} fail; first: ${bad[0] ? String(bad[0].raw_title || bad[0].rtitle || "").slice(0, 60) : "-"}`);
  }
  out.total = pl.total; out.step = pl.step; out.engineCount = engineCount == null ? null : engineCount;
  return out;
}

export async function checkOneSpec(q, env) {
  const row = { q };
  const rv = await resolveVehicle(q, {}).catch(e => ({ error: e }));
  const vehicle = rv && rv.vehicle;
  if (!vehicle || !vehicle.make) { row.error = "unresolved: " + (rv && (rv.status || rv.error?.message) || "?"); return row; }
  row.resolved = `${vehicle.year || ""} ${vehicle.make} ${vehicle.model || ""}${vehicle.trim ? " " + vehicle.trim : ""}`.trim();
  const generation = await findGeneration(vehicle, env).catch(() => null);
  // searchText is the TYPED words, exactly as the pages pass them (Sam, Oct 14 2026): building it from
  // the resolved vehicle dropped the Defender's "90" and read 27 sales where the pages read 12.
  const searchText = q;
  const f = emptyFilters();
  if (vehicle.bodyStyle) f.bodies = [String(vehicle.bodyStyle).toLowerCase()];
  // buyVehicle (Oct 2026, one-engine-entry-point job): Buy/Tasks' REAL production entry
  // (api/buySearch.js) resolves via resolveForBuy(text, env), never plain resolveVehicle -
  // resolveForBuy calls resolveVehicle first but falls back to archiveResolveToken (an
  // archive-backed phrase match) when that alone finds no model. A bare chassis-style nameplate
  // that doesn't contain its make name ("240Z" has no "Datsun" in it) is exactly the shape plain
  // resolveVehicle can miss while the archive fallback catches it - confirmed live via
  // task=buypathdiag: plain resolveVehicle("1970 Datsun 240Z") returns model:null, while
  // resolveForBuy returns model:"240Z" correctly. Reusing marketCheck/sell's plain-resolved
  // `vehicle` for buy/tasks was testing a resolver Buy never actually uses in production - a
  // test-harness artifact, not a real cross-product inconsistency (same class of issue as
  // marketCheckLane's asked:2 fix above: comparing lanes at a point one of them can't actually
  // reach). Falls back to the shared `vehicle` if resolveForBuy itself fails for any reason.
  const buyVehicle = await resolveForBuy(q, env).catch(() => null) || vehicle;

  const [marketCheck, buy, sell] = await Promise.all([
    marketCheckLane(vehicle, generation, searchText, env).catch(e => ({ ok: false, reason: String(e && e.message || e) })),
    buyLane(env, buyVehicle, f).catch(e => ({ ok: false, reason: String(e && e.message || e) })),
    sellLane(vehicle, generation, env).catch(e => ({ ok: false, reason: String(e && e.message || e) }))
  ]);
  // Tasks: the same empty-state fallback Buy uses (see header note) - a second, independent call
  // (not reusing buy's object) so a future divergence between the two call SITES still shows up.
  const tasks = await buyLane(env, buyVehicle, f).catch(e => ({ ok: false, reason: String(e && e.message || e) }));

  const sellFacts = await sellFactsLane(q, vehicle, env, marketCheck.ok ? marketCheck.count : null).catch(e => ({ ok: false, reason: String(e && e.message || e).slice(0, 120) }));
  row.lanes = { marketCheck, buy, sell, tasks, sellFacts };
  if (sellFacts.ok) { row.sellFactsCompare = sellFacts.checks; if (sellFacts.checks.some(c => c.status === "MISMATCH")) row.anyMismatch = true; }
  // Part 4, the five output checks (Lane B job, Oct 2026): logged per spec; any failing check marks
  // the row a mismatch like every other check in this harness, and names which of the five failed.
  if (marketCheck.outputInvariants) {
    row.outputInvariants = marketCheck.outputInvariants;
    const failed = marketCheck.outputInvariants.filter(c => !c.ok);
    if (failed.length) { row.anyMismatch = true; row.outputInvariantFailures = failed.map(c => `${c.name}: ${c.detail}`); }
  }
  // fallbackRung/rungLabel/siblingName (Round 5 Lane B job, Oct 2026, Part 1 sweep requirement):
  // EXACT match across every lane that answered, same discipline as window/poolYears above - these
  // name WHICH POOL/RUNG produced the answer, a fact about the read, not a number with tolerance.
  const fields = ["label", "low", "high", "count", "latest", "recent", "referenceFigure", "window", "poolYears", "fallbackRung", "rungLabel", "siblingName"];
  row.compare = fields.map(fld => compareField(fld, {
    marketCheck: marketCheck.ok ? marketCheck[fld] : null,
    buy: buy.ok ? buy[fld] : null,
    sell: sell.ok ? sell[fld] : null,
    tasks: tasks.ok ? tasks[fld] : null
  }));
  // Sell asking-line band vs Market Check's own cluster (Oct 2026, ONE RANGE decision, item 4) -
  // a DEDICATED cross-field check (sell.askingLineLow/High against marketCheck.low/high), not the
  // same-field-name dispatcher above, because the asking line is a SEPARATE runOneBox call from
  // either lane's own low/high - if someone ever reintroduces a second archive-reading
  // implementation for it, this is what catches it even if fetchOnlinePool's own cluster still
  // agrees. "fewer than 2 lanes answered" when either side has no band (both honestly thin).
  if (sell.ok && marketCheck.ok) {
    const sLow = sell.askingLineLow, sHigh = sell.askingLineHigh, mLow = marketCheck.low, mHigh = marketCheck.high;
    const present = [sLow, sHigh, mLow, mHigh].every(v => v != null);
    row.askingLineCompare = present
      ? { status: (sLow === mLow && sHigh === mHigh) ? "MATCH" : "MISMATCH", detail: `sell=${sLow}-${sHigh} marketCheck=${mLow}-${mHigh}` }
      : { status: "N/A", detail: `fewer than 2 lanes answered (sell=${sLow}-${sHigh} marketCheck=${mLow}-${mHigh})` };
    if (row.askingLineCompare.status === "MISMATCH") row.anyMismatch = true;
  }
  // Reconciliation counts (Oct 2026, count reconciliation job): qualifying/used/setAside.total/
  // aboveRange/belowRange are EXACT-match, like count above - these are discrete pool-membership
  // facts (lib/onebox.js buildResult `counts`), passed through unchanged by every lane
  // (lib/live/search.js coreOf/listingMarket for Buy/Tasks, a second runOneBox call for Sell since
  // fetchOnlinePool does not surface them - see sellLane's own comment). Any lane missing `counts`
  // entirely (a tier below "result", or a lane that failed) reads as "fewer than 2 lanes answered".
  const countFields = [
    ["qualifying", c => c && c.qualifying],
    ["used", c => c && c.used],
    ["setAsideTotal", c => c && c.setAside && c.setAside.total],
    ["aboveRange", c => c && c.setAside && c.setAside.aboveRange],
    ["belowRange", c => c && c.setAside && c.setAside.belowRange]
  ];
  const countsCompare = countFields.map(([name, pick]) => {
    const values = {
      marketCheck: marketCheck.ok ? pick(marketCheck.counts) : null,
      buy: buy.ok ? pick(buy.counts) : null,
      sell: sell.ok ? pick(sell.counts) : null,
      tasks: tasks.ok ? pick(tasks.counts) : null
    };
    const present = Object.entries(values).filter(([, v]) => v != null);
    if (present.length < 2) return { field: name, status: "N/A", detail: "fewer than 2 lanes answered" };
    const nums = present.map(([, v]) => v);
    const mismatch = nums.some(n => n !== nums[0]);
    return { field: name, status: mismatch ? "MISMATCH" : "MATCH", detail: present.map(([k, v]) => `${k}=${v}`).join(" ") };
  });
  row.countsCompare = countsCompare;
  if (countsCompare.some(c => c.status === "MISMATCH")) row.anyMismatch = true;
  row.anyMismatch = row.compare.some(c => c.status === "MISMATCH") || row.anyMismatch;
  row.lanesOk = { marketCheck: marketCheck.ok, buy: buy.ok, sell: sell.ok, tasks: tasks.ok };
  // identityQuestionAsked (Round 5 Lane B job, Oct 2026, Part 1 sweep requirement): reported, not a
  // cross-lane MISMATCH gate - Buy/Tasks (lib/live/search.js walkLadder) structurally never ask an
  // identity question at all (they are a market-READ surface, not a conversational wizard; see the
  // pre-existing diagnoseReasons note above on the generation_choice asymmetry), so comparing them
  // against Market Check's own question-or-answer choice would always "mismatch" on any car that
  // genuinely needs one - that is expected architecture, not a bug. This names what Market Check
  // (the one lane that can ask) actually did, for the report's own "was an identity question asked"
  // requirement.
  row.identityQuestionAsked = marketCheck.identityQuestionAsked === true;
  row.reasons = diagnoseReasons(row, { vehicle, marketCheck, buy, sell, tasks });

  try {
    const live = await liveForFamily(env, vehicle, generation, f, 50);
    row.abroad = { liveMatches: live.total, note: "isAbroadRow() is the single shared exclusion Buy/Tasks/Market Check's live panel all import" };
  } catch (e) { row.abroad = { error: String(e && e.message || e) }; }

  return row;
}

// ONE PICK (Oct 2026, GT-R): fails when (a) a second depth tie-break exists anywhere in the pick code, or
// (b) a tie car's venue from Sell's real decide() (api/sellerDecision.js, fed by buildSharedAnalysis) differs
// from the shared pickPlatform (lib/platformPick.js) for the same car. The one tie-break is
// lib/platformPick.js depthWins; every pick path must call it.
const PICK_FILES = ["lib/platformPick.js", "api/sellerDecision.js", "js/result.js", "js/result-v2.js"];
// Pieces of the pick that live ONLY in lib/platformPick.js (the Oct 2026 fold, rules 1 to 3). Any of them in
// another pick file is a second implementation: a depth leader or tie-break, a premium gate, a dominance gate,
// a specialist test, or the page's old rush loop.
const FOLDED = /(>|===|>=)\s*(deepN|bestN|leaderN|bestCount)\b|\bclearedPct\b|\bspecCell\b|\bevBacked\b|\.marketShare\s*>=\s*75|lift_rounded\)\s*>=\s*3|platformSales\s*>=\s*Math\.max|\bdepthWins\(/;
// One car per rule, each run through Sell's real decide() and the shared pickPlatform (filled from the
// pickfold comparison, Oct 2026). kind: "specialist" (rule 1), "tie" (rule 2), "rush" (rule 3).
const PICK_CASES = [
  // rule 1: PCarMarket holds a 12x specialist cell but has 1 sale here; one sale never makes a specialist
  { q: "1993 Porsche 911 Carrera RS Targa", kind: "specialist", notVenue: "pcarmarket" },
  // rule 2: 4 v 4 between Cars and Bids and Bring a Trailer; the more recent sale wins
  { q: "2009 Nissan GT-R", kind: "tie" },
  // rule 3: rush, short-auction venues only, deeper wins (Hagerty 12 over Hemmings 4)
  { q: "1965 Chevrolet Corvette", kind: "rush" }
];
// DEPTH-WINS FIXTURES (job 11, Oct 2026): depthWins is a PURE function (n, slug, bestN, bestSlug,
// meta) - the real tie-break path. The old check instead relied on LIVE ARCHIVE DATA happening to
// hold an exact sales tie for one hardcoded car (2009 Nissan GT-R) RIGHT NOW to "exercise" the tie
// branch, so it failed "exercised" on every run where fresh ingest broke the tie - not a real
// regression, just the archive moving on. These fixtures call depthWins directly with synthetic
// counts, so the tie case (and every other branch) is exercised and graded EVERY run, deterministically,
// with no archive read at all. The live GT-R/specialist/rush cases below still run end to end (real
// value: do Sell and the shared pick actually agree on a real car) but no longer gate on whether
// today's data happens to contain a tie.
const DEPTH_WINS_FIXTURES = [
  { name: "not a tie, more sales wins", args: [10, "a", 6, "b", new Map()], expect: true },
  { name: "not a tie, fewer sales loses", args: [4, "a", 6, "b", new Map()], expect: false },
  { name: "no incumbent yet, anything beats null", args: [1, "a", 0, null, new Map()], expect: true },
  { name: "exact tie, more recent sale wins", args: [5, "a", 5, "b", new Map([["a", { latest: "2026-09-01" }], ["b", { latest: "2026-01-01" }]])], expect: true },
  { name: "exact tie, less recent sale loses", args: [5, "a", 5, "b", new Map([["a", { latest: "2026-01-01" }], ["b", { latest: "2026-09-01" }]])], expect: false },
  { name: "exact tie, same date, higher model-level count wins", args: [5, "a", 5, "b", new Map([["a", { latest: "2026-01-01", modelN: 40 }], ["b", { latest: "2026-01-01", modelN: 12 }]])], expect: true },
  { name: "exact tie, same date, lower model-level count loses", args: [5, "a", 5, "b", new Map([["a", { latest: "2026-01-01", modelN: 12 }], ["b", { latest: "2026-01-01", modelN: 40 }]])], expect: false },
  { name: "exact tie, every other factor equal, Bring a Trailer wins", args: [5, "bringatrailer", 5, "carsandbids", new Map([["bringatrailer", { latest: "2026-01-01" }], ["carsandbids", { latest: "2026-01-01" }]])], expect: true },
  { name: "exact tie, every other factor equal, incumbent keeps it (neither is BaT)", args: [5, "carsandbids", 5, "hagerty", new Map([["carsandbids", { latest: "2026-01-01" }], ["hagerty", { latest: "2026-01-01" }]])], expect: false }
];
// Exported directly (job 2, prePush rule, Oct 2026): a pure-function check, no env/DB needed, so
// scripts/prePush.mjs can run it on every push even with no Supabase credentials available locally.
// CACHE-KEY YEAR ISOLATION (Lane B job, Oct 2026, Part 2): a pure, DB-free regression guard for the
// 42-vs-30-sales 2025 Porsche 911 drift. Root cause: lib/live/search.js specKeyFor keyed a model with
// NO half-generation entry (a bare 911, 992 generation) on generation.code ALONE - two typed years
// inside the same generation produced the IDENTICAL cache key, so whichever year's ladder computed
// first silently answered for the other too. The 63-spec sweep (checkOneSpec, above) could not have
// caught this: it reads each spec in isolation, at one moment, across the four lanes - it never
// probes whether TWO DIFFERENT specs collide on ONE cache row, which is a property of the key
// function itself, not of any single spec's own answer. This check asserts that property directly:
// every pair below must produce DIFFERENT keys. No DB, no network - specKeyFor is a pure function of
// its inputs, so this runs in prePush on every push, not just when someone happens to query two
// colliding years back to back in the same sweep run.
const SPEC_KEY_ISOLATION_FIXTURES = [
  // The exact bug: a curated generation with NO half-generation entry (911's 992) keyed on
  // generation.code alone before the fix - 2020 and 2025 used to produce one shared row.
  { name: "992 911, different years", a: { make: "Porsche", model: "911", trim: null, year: 2020, bodyStyle: null }, b: { make: "Porsche", model: "911", trim: null, year: 2025, bodyStyle: null }, gen: { code: "992", yearStart: 2019, yearEnd: 2026 } },
  // The two golden cars this exact job adds to DEFAULT_SPECS below - must never share a row either.
  { name: "2025 911 vs 2024 Carrera S Coupe", a: { make: "Porsche", model: "911", trim: null, year: 2025, bodyStyle: null }, b: { make: "Porsche", model: "911", trim: "Carrera S", year: 2024, bodyStyle: "coupe" }, gen: { code: "992", yearStart: 2019, yearEnd: 2026 } },
  // A half-generation model (997.2, the pre-existing year-collision fix) - still isolated by year.
  { name: "997.2 Carrera S, different years", a: { make: "Porsche", model: "911", trim: "Carrera S", year: 2009, bodyStyle: "coupe" }, b: { make: "Porsche", model: "911", trim: "Carrera S", year: 2010, bodyStyle: "coupe" }, gen: { code: "997", yearStart: 2005, yearEnd: 2011 } },
  // edition/variant/wheelbase (Part 1 job): same year/make/model/trim/body, different resolver field.
  { name: "Defender 90 vs 110, same year", a: { make: "Land Rover", model: "Defender", trim: "90", year: 1997, bodyStyle: null, wheelbase: "90" }, b: { make: "Land Rover", model: "Defender", trim: "110", year: 1997, bodyStyle: null, wheelbase: "110" }, gen: null },
  { name: "240Z Series 1 vs plain, same year", a: { make: "Datsun", model: "240Z", trim: null, year: 1971, bodyStyle: null, edition: "Series 1" }, b: { make: "Datsun", model: "240Z", trim: null, year: 1971, bodyStyle: null, edition: null }, gen: null }
];
export function checkSpecKeyYearIsolation() {
  const cases = SPEC_KEY_ISOLATION_FIXTURES.map(f => {
    const keyA = specKeyFor(f.a, f.gen, null), keyB = specKeyFor(f.b, f.gen, null);
    return { name: f.name, keyA, keyB, pass: keyA !== keyB };
  });
  return { ok: cases.every(c => c.pass), cases };
}

// REFINE KEY ISOLATION (e49, Sam's item 13): pure, no DB. The applied refine (body, trim, variant) is part of every
// cache key an answer is stored under, so a chip page and the bare page can never share an entry. Six refines of one
// car must be six keys, on specKeyFor and on the Market Check warm key alike.
export function checkRefineKeyIsolation() {
  const v = { make: "Porsche", model: "911", trim: "", year: 2005, bodyStyle: null }, gen = { code: "997" };
  const forms = { plain: null, coupe: { body: "coupe" }, carreraS: { trim: "carrera-s" }, carrera: { variant: "carrera" }, manual: { tx: "manual" }, coupeManual: { tx: "manual", body: "coupe" } };
  const keys = Object.fromEntries(Object.entries(forms).map(([n, r]) => [n, specKeyFor(v, gen, r)]));
  const warm = Object.fromEntries(Object.entries(forms).map(([n, r]) => [n, warmAnswerKeyFor(v, gen, r)]));
  const distinct = o => new Set(Object.values(o)).size === Object.keys(o).length;
  const m = { make: "Ford", model: "Mustang", trim: "", year: 1965, bodyStyle: null }, mg = { code: "first" };
  const cases = [
    { name: "2005 911: plain, coupe, carrera-s, carrera, manual, coupe+manual are six specKeyFor keys", pass: distinct(keys), keys },
    { name: "2005 911: the same six are six warm rows", pass: distinct(warm) },
    { name: "1965 Mustang: the Coupe chip's key is not the bare key", pass: specKeyFor(m, mg, { body: "coupe" }) !== specKeyFor(m, mg, null) },
    { name: "a refine with none of the four fields keys as plain", pass: specKeyFor(v, gen, { miMin: 20000 }) === specKeyFor(v, gen, null) }
  ];
  return { ok: cases.every(c => c.pass), cases };
}
// REFINE ISOLATION, LIVE (e49, Sam's item 13): plain, then the Coupe chip, then plain again, and the chip first the other
// way round, through engineAnswer (rangeCache + the stored row, the path Buy, Tasks and the Market Check panel read).
// Every plain answer must agree with every other plain answer, every chip answer with every other chip answer, and the
// chip's pool must be smaller than the bare pool (a coupe pool is a part of the car's pool).
export const REFINE_ISOLATION_SPECS = [["2005 Porsche 911", { body: "coupe" }], ["1965 Ford Mustang", { body: "coupe" }]];
export async function checkRefineIsolation(env, specs = REFINE_ISOLATION_SPECS) {
  const out = { ok: true, cases: [] };
  const shape = d => ({ tier: (d && d.tier) || null, poolN: d && d.poolN != null ? d.poolN : null, rungLabel: (d && d.rungLabel) || null, applied: d && d.resolvedCar && d.resolvedCar.applied ? d.resolvedCar.applied : null });
  for (const [q, refine] of specs) {
    const row = { q, refine };
    try {
      const rv = await resolveVehicle(q, {}), vehicle = rv && rv.vehicle;
      if (!vehicle || !vehicle.make) throw new Error("unresolved");
      const generation = await findGeneration(vehicle, env).catch(() => null);
      const call = async r => shape(await engineAnswer(vehicle, generation, q, env, r));
      row.plainFirst = [await call(null), await call(refine), await call(null)];
      row.chipFirst = [await call(refine), await call(null), await call(refine)];
      const p = [row.plainFirst[0], row.plainFirst[2], row.chipFirst[1]], c = [row.plainFirst[1], row.chipFirst[0], row.chipFirst[2]];
      row.plainAgree = p.every(x => x.poolN === p[0].poolN && x.tier === p[0].tier && x.rungLabel === p[0].rungLabel);
      row.chipAgree = c.every(x => x.poolN === c[0].poolN && x.tier === c[0].tier && x.rungLabel === c[0].rungLabel);
      row.chipNarrower = p[0].poolN != null && c[0].poolN != null && c[0].poolN < p[0].poolN;
      row.keysDiffer = specKeyFor(vehicle, generation, null) !== specKeyFor(vehicle, generation, refine);
      row.pass = row.plainAgree && row.chipAgree && row.chipNarrower && row.keysDiffer;
    } catch (e) { row.error = String(e && e.message || e); row.pass = false; }
    if (!row.pass) out.ok = false;
    out.cases.push(row);
  }
  return out;
}

// OUTPUT GATE FIXTURES (Lane B job, Oct 13 2026, Job 1): pure, no DB - the exact shapes the live gate
// wrongly refused, as synthetic answers through the REAL runOutputInvariants, so the refusal can never
// come back on a push without this failing first. Plus one genuinely swapped pool that MUST still fail,
// so the gate is proven to still gate.
const card = (make, model, title) => ({ make, model, title });
const GATE_FIXTURES = [
  // e36/e37 (Oct 14 2026): a chassis-code query's pool holds the nameplate's rows on purpose (the union); not a swapped pool.
  { name: "997 Carrera S: rows filed under '911' in a '997' query's pool are the same car (chassis-code union)", expect: true,
    vehicle: { make: "Porsche", model: "997", trim: "Carrera S", year: 2008 },
    d: { tier: "result", fallbackRung: "exact", rungLabel: "2008 997 Carrera S Coupe", resolvedCar: { trim: "Carrera S", genCode: "997" }, poolN: 4, cluster: [58500, 69000], rawPool: [{ _usd: 55000, year: 2008 }, { _usd: 60000, year: 2008 }, { _usd: 65000, year: 2008 }, { _usd: 70000, year: 2008 }],
      cards: [card("Porsche", "911", "2008 Porsche 911 Carrera S Coupe"), card("Porsche", "911", "2008 Porsche 911 Carrera S Coupe 6-Speed"), card("Porsche", "911", "2008 Porsche 911 Carrera S Coupe"), card("Porsche", "997", "2008 Porsche 997 Carrera S Coupe 6-Speed")] } },
  // e54 (Oct 15 2026, the blank Camaro and Mustang pages): a bare answer whose options include "Body not stated" (and whose
  // bodyUnspecified still counts those rows) must be ACCEPTED; e53's gate added the unspecified rows twice and refused it.
  { name: "1969 Camaro: options Coupe 17, Convertible 3, Body not stated 1 sum to the pool of 21 (unspecified rows counted once)", expect: true,
    vehicle: { make: "Chevrolet", model: "Camaro", trim: "", year: 1969 },
    d: { tier: "result", fallbackRung: "exact", rungLabel: "1969 Camaro, coupes and convertibles", resolvedCar: { trim: "", genCode: "first" }, poolN: 21, cluster: [45500, 78500],
      bodyOptions: [{ value: "coupe", label: "Coupe", n: 17, inPool: 17 }, { value: "convertible", label: "Convertible", n: 3, inPool: 3 }, { value: "unspecified", label: "Body not stated", n: 1, inPool: 1 }], bodyUnspecified: 1,
      rawPool: Array.from({ length: 21 }, (_, i) => ({ _usd: 40000 + i * 2000, year: 1969 })),
      cards: Array.from({ length: 21 }, (_, i) => card("Chevrolet", "Camaro", i < 17 ? "1969 Chevrolet Camaro Coupe" : i < 20 ? "1969 Chevrolet Camaro Convertible" : "1969 Chevrolet Camaro")) } },
  // and the same answer with the unspecified rows in NO option (e51 to e52's shape) must still fail: a silent gap is a gap.
  { name: "1969 Camaro: options Coupe 17, Convertible 3 against a pool of 21 with one row in no option is refused", expect: false,
    vehicle: { make: "Chevrolet", model: "Camaro", trim: "", year: 1969 },
    d: { tier: "result", fallbackRung: "exact", rungLabel: "1969 Camaro, coupes and convertibles", resolvedCar: { trim: "", genCode: "first" }, poolN: 21, cluster: [45500, 78500],
      bodyOptions: [{ value: "coupe", label: "Coupe", n: 17, inPool: 17 }, { value: "convertible", label: "Convertible", n: 3, inPool: 3 }], bodyUnspecified: 0,
      rawPool: Array.from({ length: 21 }, (_, i) => ({ _usd: 40000 + i * 2000, year: 1969 })),
      cards: Array.from({ length: 21 }, (_, i) => card("Chevrolet", "Camaro", i < 17 ? "1969 Chevrolet Camaro Coupe" : i < 20 ? "1969 Chevrolet Camaro Convertible" : "1969 Chevrolet Camaro")) } },
  // Golden car 12 (Oct 14 2026): a generation label over receipts that hold only two of the generation's years must fail.
  { name: "GT3: '(992 generation)' label over a 2023 to 2024 pool names a wider span than the receipts", expect: false,
    vehicle: { make: "Porsche", model: "911", trim: "GT3", year: 2024 },
    d: { tier: "result", fallbackRung: "generation", rungLabel: "911 GT3 (992 generation)", genYears: [2020, 2026], resolvedCar: { trim: "GT3" }, poolN: 3, cluster: [243000, 269000], rawPool: [{ _usd: 240000, year: 2023 }, { _usd: 250000, year: 2024 }, { _usd: 270000, year: 2023 }],
      cards: [card("Porsche", "911", "2023 Porsche 911 GT3"), card("Porsche", "911", "2024 Porsche 911 GT3"), card("Porsche", "911", "2023 Porsche 911 GT3")] } },
  { name: "GT3: '2023 to 2024' label over the same pool describes the receipts exactly", expect: true,
    vehicle: { make: "Porsche", model: "911", trim: "GT3", year: 2024 },
    d: { tier: "result", fallbackRung: "year_widened", rungLabel: "911 GT3 models, 2023 to 2024", genYears: [2020, 2026], resolvedCar: { trim: "GT3" }, poolN: 3, cluster: [243000, 269000], rawPool: [{ _usd: 240000, year: 2023 }, { _usd: 250000, year: 2024 }, { _usd: 270000, year: 2023 }],
      cards: [card("Porsche", "911", "2023 Porsche 911 GT3"), card("Porsche", "911", "2024 Porsche 911 GT3"), card("Porsche", "911", "2023 Porsche 911 GT3")] } },
  { name: "Grand National: archive model column 'Grand National - Regal' is the Regal", expect: true,
    vehicle: { make: "Buick", model: "Regal", trim: "Grand National" },
    d: { tier: "result", fallbackRung: "exact", rungLabel: "1987 Regal Grand National", resolvedCar: { trim: "Grand National" }, poolN: 4, cluster: [35500, 56000], rawPool: [{ _usd: 30000 }, { _usd: 40000 }, { _usd: 50000 }, { _usd: 60000 }],
      cards: [card("Buick", "Regal", "1987 Buick Regal Grand National"), card("Buick", "Grand National - Regal", "1987 Buick Grand National"), card("Buick", "Grand National - Regal", "1987 Buick Regal Grand National"), card("Buick", "Regal", "1987 Buick Regal Grand National")] } },
  { name: "275 GTB/4: one stray 365 in a 14-sale pool is a minority, the answer stands", expect: true,
    vehicle: { make: "Ferrari", model: "275", trim: "GTB/4 Spider" },
    d: { tier: "result", fallbackRung: "model_any_year", rungLabel: "275, all years", resolvedCar: { trim: null }, poolN: 14, cluster: [1925000, 2835000], rawPool: Array.from({ length: 14 }, (_, i) => ({ _usd: 200000 + i * 250000 })),
      cards: [...Array.from({ length: 13 }, (_, i) => card("Ferrari", "275", `196${5 + (i % 3)} Ferrari 275 GTB/4 Chassis no. ${10000 + i}`)), card("Ferrari", "365", "1969 Ferrari 365 GT 2+2 Chassis no. 12751")] } },
  { name: "CLK63 Black Series: model column 'CLK AMG'/'CLK63 AMG Black' shares the CLK stem; trim token named by the label", expect: true,
    vehicle: { make: "Mercedes-Benz", model: "CLK-Class", trim: "CLK63 AMG" },
    d: { tier: "result", fallbackRung: "exact", rungLabel: "2008 CLK63 Black Series", resolvedCar: { trim: "Black Series" }, poolN: 3, cluster: [95000, 146000], rawPool: [{ _usd: 90000 }, { _usd: 120000 }, { _usd: 150000 }],
      cards: [card("Mercedes-Benz", "CLK AMG", "2008 Mercedes-Benz CLK63 AMG Black Series"), card("Mercedes-Benz", "CLK63 AMG Black", "2008 Mercedes-Benz CLK63 AMG Black Series"), card("Mercedes-Benz", "CLK-Class", "2008 Mercedes-Benz CLK63 AMG Black Series")] } },
  { name: "M3 Coupe: model column '3-Series' but the title says M3", expect: true,
    vehicle: { make: "BMW", model: "M3", trim: null },
    d: { tier: "result", fallbackRung: "exact", rungLabel: "2003 M3 Coupe", resolvedCar: { trim: null }, poolN: 2, cluster: [23500, 35500], rawPool: [{ _usd: 20000 }, { _usd: 40000 }],
      cards: [card("BMW", "3-Series", "2003 BMW M3 Coupe 6-Speed"), card("BMW", "M3", "2003 BMW M3 Coupe")] } },
  { name: "992 column for a typed 911 (chassis-code alias, e29)", expect: true,
    vehicle: { make: "Porsche", model: "911", trim: null },
    d: { tier: "result", fallbackRung: "year_widened", rungLabel: "911 Carrera and Carrera S models, 2024 to 2026", resolvedCar: { genCode: "992", trim: null }, poolN: 2, cluster: [143000, 163000], rawPool: [{ _usd: 140000 }, { _usd: 170000 }],
      cards: [card("Porsche", "992", "2024 Porsche 911 Carrera S Coupe"), card("Porsche", "911", "2026 Porsche 911 Carrera Coupe")] } },
  { name: "a genuinely swapped pool (Mustangs under a Camaro) still fails", expect: false,
    vehicle: { make: "Chevrolet", model: "Camaro", trim: null },
    d: { tier: "result", fallbackRung: "exact", rungLabel: "1969 Camaro", resolvedCar: { trim: null }, poolN: 4, cluster: [45500, 78500], rawPool: [{ _usd: 40000 }, { _usd: 50000 }, { _usd: 60000 }, { _usd: 80000 }],
      cards: [card("Ford", "Mustang", "1969 Ford Mustang Mach 1"), card("Ford", "Mustang", "1969 Ford Mustang Boss 302"), card("Ford", "Mustang", "1969 Ford Mustang GT"), card("Chevrolet", "Camaro", "1969 Chevrolet Camaro")] } }
];
export function checkOutputGateFixtures() {
  const cases = GATE_FIXTURES.map(f => {
    const checks = runOutputInvariants(f.d, f.vehicle);
    const failed = checks.filter(c => !c.ok).map(c => c.name);
    const accepted = failed.length === 0;
    return { name: f.name, expect: f.expect, accepted, failed, pass: accepted === f.expect };
  });
  return { ok: cases.every(c => c.pass), cases };
}
// FENCE WORD FIXTURES (Lane B job, Oct 13 2026, Job 4): the replica/memorabilia fence (lib/_classify.js
// isMemorabilia) on the hyphenated and spaced spellings the archive actually uses, plus the words that must
// NOT trip it. Pure, no DB.
const FENCE_WORD_FIXTURES = [
  ["1957 PORSCHE 356 SPEEDSTER RE-CREATION", true], ["1956 Porsche 356 Speedster Re Creation", true], ["1957 Porsche 356 Speedster Recreation", true],
  ["1967 Shelby GT500CR by Classic Recreations", true], ["1958 Porsche 356 Speedster Replica by Beck", true], ["1965 Shelby Cobra Re-Production", true],
  ["1957 Porsche 356A Speedster", false], ["2019 Winnebago Recreational Vehicle", false], ["1966 Ford Bronco", false]
];
export function checkFenceWordFixtures() {
  const cases = FENCE_WORD_FIXTURES.map(([title, expect]) => ({ title, expect, got: isMemorabilia(title), pass: isMemorabilia(title) === expect }));
  return { ok: cases.every(c => c.pass), cases };
}

export function checkDepthWinsFixtures() {
  const cases = DEPTH_WINS_FIXTURES.map(f => {
    const got = depthWins(...f.args);
    return { name: f.name, expect: f.expect, got, pass: got === f.expect };
  });
  return { ok: cases.every(c => c.pass), cases };
}

export async function checkSinglePick(env) {
  const out = { ok: true, tieBreakCopies: [], cases: [] };
  out.depthWinsFixtures = checkDepthWinsFixtures();
  if (!out.depthWinsFixtures.ok) out.ok = false;
  for (const f of PICK_FILES) {
    if (f === "lib/platformPick.js") continue;   // the one home of these rules
    let src = null;
    try { src = fs.readFileSync(new URL("../" + f, import.meta.url), "utf8"); } catch { out.sourceNote = "pick sources not readable here (serverless bundle); the nightly run checks them"; continue; }
    src.split("\n").forEach((line, i) => { if (/^\s*\/\//.test(line)) return; if (FOLDED.test(line)) out.tieBreakCopies.push(`${f}:${i + 1}`); });
  }
  if (out.tieBreakCopies.length) out.ok = false;
  const k = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const c of PICK_CASES) {
    const row = { q: c.q, kind: c.kind };
    try {
      const rv = await resolveVehicle(c.q, {}), vehicle = rv && rv.vehicle;
      if (!vehicle || !vehicle.make) throw new Error("unresolved");
      const generation = await findGeneration(vehicle, env).catch(() => null);
      const criteria = getSellerCriteria({ raw: c.q, region: "US", state: "California", timeline: c.kind === "rush" ? "As soon as possible" : "No rush" });
      const analysis = await buildSharedAnalysis(vehicle, generation, env, criteria);
      const dec = analysis ? decide(analysis, criteria, vehicle) : null;
      const shared = await pickPlatform(vehicle, generation, env, criteria);
      if (c.kind === "rush") {
        row.sell = dec && dec.speedPick; row.shared = shared && shared.reasonCode === "speed" ? (shared.platformDisplay || shared.platform) : null;
        row.exercised = !!row.shared;
      } else {
        row.sell = dec && dec.recommendedPath; row.shared = shared && (shared.platformDisplay || shared.platform);
        const sp = analysis && analysis.sharedPick && analysis.sharedPick.baseline;
        if (c.kind === "specialist") row.exercised = !!(sp && sp.reasonCode !== "specialist" && k(sp.platform) !== k(c.notVenue));
        if (c.kind === "tie") { const top = (analysis.platformPerformance || []).filter(v => v.evidenceSales > 0).sort((a, b) => b.evidenceSales - a.evidenceSales); row.exercised = top.length > 1 && top[0].evidenceSales === top[1].evidenceSales; }
      }
      row.agree = !!row.sell && !!row.shared && (k(row.sell) === k(row.shared) || k(row.sell) === k(shared && shared.platform));
    } catch (e) { row.error = String(e && e.message || e); }
    // Gate on agree alone (job 11): whether Sell's real decide() and the shared pickPlatform land on
    // the same venue for a real car is a genuine invariant. Whether today's live archive happens to
    // still hold the exact tie/specialist/rush shape named for this car (`exercised`) is reported for
    // visibility but no longer gates ok - the archive moves nightly and a broken tie is not a
    // regression. The tie-break LOGIC itself is covered deterministically by depthWinsFixtures above.
    if (!row.agree) out.ok = false;
    out.cases.push(row);
  }
  return out;
}

// BUY PATHS (Oct 2026, Sam): the same typed car gives the same live cars on Buy's two search paths, the chat's
// search step (lib/live/samChat.js searchWithNearest) and the no-model search (lib/live/converse.js converse),
// including the shared nearest-years rule (lib/live/search.js nearestYears). The chat step is given the car as
// the resolver reads the typed words (make, model, trim, years); the model's own tool input can phrase it
// differently, which is outside this engine check. Live rows only, no vendor call.
export const BUY_PATH_CASES = ["1988 Porsche 911 Carrera", "1967 Chevrolet Corvette", "1966 Ford Bronco", "2009 Porsche 911 Carrera S", "Jaguar E-Type"];
export async function checkBuyPaths(env, cases = BUY_PATH_CASES) {
  const { converse } = await import("../lib/live/converse.js");
  const { searchWithNearest } = await import("../lib/live/samChat.js");
  const { parseQuery, resolveForBuy } = await import("../lib/live/search.js");
  const out = { ok: true, cases: [] };
  for (const q of cases) {
    const row = { q };
    try {
      const pq = parseQuery(q), v = await resolveForBuy(pq.text || q, env);
      const p = { make: v && v.make, model: v && v.model, trim: v && v.trim || undefined, year_min: pq.filters.yearMin || undefined, year_max: pq.filters.yearMax || undefined };
      const chat = await searchWithNearest(env, p);
      const nm = await converse(env, { messages: [q], scripted: true });
      const ids = list => [...new Set((list || []).map(x => Number(x.r.id)))].sort((a, b) => a - b);
      row.chat = { n: chat.sr.matches.length, near: chat.near ? chat.near.years : null };
      row.noModel = nm.type === "results" || nm.type === "groups" ? { n: (nm.matches || []).length, near: nm.near ? nm.near.years : null } : { type: nm.type };
      const a = ids(chat.sr.matches), b = ids(nm.matches);
      row.sameCars = nm.type === "results" || nm.type === "groups" ? JSON.stringify(a) === JSON.stringify(b) : null;
      row.sameNear = JSON.stringify(row.chat.near) === JSON.stringify(nm.near ? nm.near.years : null);
      if (row.sameCars === false) { row.onlyChat = a.filter(x => !b.includes(x)).slice(0, 8); row.onlyNoModel = b.filter(x => !a.includes(x)).slice(0, 8); }
      if (row.sameCars === false || !row.sameNear) out.ok = false;
    } catch (e) { row.error = String(e && e.message || e); out.ok = false; }
    out.cases.push(row);
  }
  return out;
}

// LIVE COMPARABLE FENCE (job 3, trim-fence sweep, Oct 2026): a live "comparable right now" listing
// must pass the SAME title/year fence (lib/onebox.js titleFenceReason) the sales pool applies - the
// shared engine liveForFamily now calls that function itself, so this is a regression guard, not a
// second implementation. Fails if any row liveForFamily actually returned would be rejected by the
// identical fence its own spec implies (the exact class of leak that shipped before this round: a
// Turbo S in a bare Cabriolet search, a non-M3 and a conversion in an M3 Coupe search).
export const LIVE_FENCE_CASES = ["2025 Porsche 911 Cabriolet", "2005 BMW M3 Coupe", "1969 Chevrolet Camaro Convertible"];
export async function checkLiveComparableFences(env, cases = LIVE_FENCE_CASES) {
  const out = { ok: true, cases: [] };
  for (const q of cases) {
    const row = { q };
    try {
      const rv = await resolveVehicle(q, {}), vehicle = rv && rv.vehicle;
      if (!vehicle || !vehicle.make) throw new Error("unresolved");
      const generation = await findGeneration(vehicle, env).catch(() => null);
      const spec = buildSpec(vehicle, generation, q);
      const live = await liveForFamily(env, vehicle, generation, null, 50);
      const failures = [];
      for (const r of live.rows) {
        const fenceRow = { raw_title: r.listing_title || r.title || "", rtitle: r.listing_title || r.title || "", year: r.year || null, mods: r.modifications || null };
        const reason = titleFenceReason(fenceRow, spec);
        if (reason) failures.push({ title: fenceRow.raw_title, reason });
      }
      row.liveCount = live.rows.length;
      row.failures = failures;
      if (failures.length) out.ok = false;
    } catch (e) { row.error = String(e && e.message || e); }
    out.cases.push(row);
  }
  return out;
}

// LIVE-LISTING REGRESSION CASES (Oct 2026, "false none live" job): a real, Sam-reported pair -
// a 1989 BMW 325i Convertible (abroad, CA) that a "1989 BMW" search said did not exist anywhere,
// and a 2021 BMW X3 M40i that was simply absent from live_listings (pull/vendor gap, still open,
// NOT fixed by this job - see docs/lane-notes.md). Each case names the query, the listing's own
// url (for the pool-presence check) and the expected behaviour so a future code change can't
// silently reopen the abroad-disclosure bug, and so the day the X3 listing enters the pool, this
// check starts asserting it is actually found instead of silently passing on its absence.
export const LIVE_LISTING_CASES = [
  { q: "1989 BMW", url: "https://bringatrailer.com/listing/1989-bmw-325i-230/", expectAbroadMention: true },
  { q: "2021 BMW X3 M40i", url: "https://carsandbids.com/auctions/rj0VnZW2/2021-bmw-x3-m40i", expectAbroadMention: false }
];
export async function checkLiveListingDisclosure(env, cases = LIVE_LISTING_CASES) {
  const out = { ok: true, cases: [] };
  for (const c of cases) {
    const row = { q: c.q, url: c.url };
    try {
      const inPool = await supabaseSelect(env, `live_listings?url=eq.${encodeURIComponent(c.url)}&select=id,status&limit=1`).catch(() => null);
      row.inPool = Array.isArray(inPool) && inPool.length > 0;
      const r = await converse(env, { messages: [c.q] });
      row.say = (r && r.say) || null;
      row.near = (r && r.near) || null;
      if (!row.inPool) {
        // A listing genuinely absent from our own pool can never be asserted as found - that is a
        // pull/vendor question, not an engine-logic one (see the job's lane-notes entry). Only check
        // that the engine never CLAIMS a found-but-filtered car does not exist, which needs no live
        // row to verify (the sentence shape itself is what regressed before).
        row.note = "not in live_listings - pull/vendor gap, not asserted as found (see lane-notes)";
      } else if (r && r.type === "results" && (r.matches || []).some(x => x && x.r && x.r.url === c.url)) {
        row.found = true;
      } else if (c.expectAbroadMention) {
        const mentionsAbroad = /\babroad\b/i.test(String(row.say || ""));
        row.foundViaAbroadDisclosure = mentionsAbroad;
        if (!mentionsAbroad) { row.ok = false; out.ok = false; }
      } else {
        row.ok = false; out.ok = false; row.reason = "expected to find the car (in pool, no abroad fence expected) but it was not in matches";
      }
    } catch (e) { row.error = String(e && e.message || e); out.ok = false; }
    out.cases.push(row);
  }
  return out;
}

// PICK-REPRESENTATIVE INVARIANTS (jobs 4 and 6, trim-fence sweep, Oct 2026): (a) the middle/"closest"
// card (basis "middle", not a real-similarity "subject" match) must sit INSIDE the headline cluster/
// span, never outside it; (b) the trim QUESTION's option counts must never sum to more than the
// universal-fenced pool they were drawn from (trimQuestion.poolN). Both read straight off runOneBox's
// own output fields - no second computation, just the invariant the engine's own comment promises.
export const REPRESENTATIVE_CASES = ["2025 Porsche 911 Cabriolet", "2025 Porsche 911 Coupe", "2005 BMW M3 Coupe", "2005 BMW M3 Cabriolet"];
export async function checkRepresentativeInvariants(env, cases = REPRESENTATIVE_CASES) {
  const out = { ok: true, cases: [] };
  for (const q of cases) {
    const row = { q };
    try {
      const rv = await resolveVehicle(q, {}), vehicle = rv && rv.vehicle;
      if (!vehicle || !vehicle.make) throw new Error("unresolved");
      const generation = await findGeneration(vehicle, env).catch(() => null);
      const d = await runOneBox(vehicle, generation, q, env, null);
      const band = Array.isArray(d.cluster) ? d.cluster : (Array.isArray(d.span) ? d.span : null);
      const rep = d.representative;
      if (rep && rep.closest && rep.closest.basis !== "subject" && band) {
        const p = rep.closest.price;
        row.middleInRange = Number.isFinite(p) && p >= Math.min(band[0], band[1]) && p <= Math.max(band[0], band[1]);
        if (!row.middleInRange) { row.middlePrice = p; row.band = band; out.ok = false; }
      } else row.middleInRange = null;
      const tq = d.trimQuestion;
      if (tq && Array.isArray(tq.options) && Number.isFinite(tq.poolN)) {
        const sum = tq.options.reduce((s, o) => s + (Number(o.n) || 0), 0);
        row.optionsSum = sum; row.poolN = tq.poolN; row.optionsWithinPool = sum <= tq.poolN;
        if (!row.optionsWithinPool) out.ok = false;
      } else row.optionsWithinPool = null;
    } catch (e) { row.error = String(e && e.message || e); }
    out.cases.push(row);
  }
  out.ok = out.ok && out.cases.every(c => !c.error);
  return out;
}

// SPLIT-POOL INVARIANTS (job 3, pool-consistency root cause, Oct 2026): every split (gearbox,
// competition) must be a subset of the headline pool - sides + unknown must sum to EXACTLY poolN
// (d.soldCount), never more, never less. Confirmed live before the fix: a 2005 BMW M3 Coupe headline
// read 87 while its gearbox split read 131 manual + 16 SMG = 147, a genuinely different pool, not a
// rounding gap.
export const SPLIT_POOL_CASES = ["2002 to 2006 BMW M3 Coupe", "2025 Porsche 911 Cabriolet"];
export async function checkSplitPoolInvariants(env, cases = SPLIT_POOL_CASES) {
  const out = { ok: true, cases: [] };
  for (const q of cases) {
    const row = { q };
    try {
      const rv = await resolveVehicle(q, {}), vehicle = rv && rv.vehicle;
      if (!vehicle || !vehicle.make) throw new Error("unresolved");
      const generation = await findGeneration(vehicle, env).catch(() => null);
      const d = await runOneBox(vehicle, generation, q, env, null);
      row.headline = d.soldCount;
      const splits = Array.isArray(d.inlineSplits) ? d.inlineSplits : [];
      row.splits = splits.map(s => {
        const sum = (s.sides || []).reduce((acc, side) => acc + (Number(side.n) || 0), 0);
        const total = sum + (Number(s.unknown) || 0);
        const exact = Number.isFinite(s.poolN) ? total === s.poolN : null;
        if (exact === false) out.ok = false;
        return { key: s.key, sidesSum: sum, unknown: s.unknown, poolN: s.poolN, sumMatchesPoolN: exact };
      });
    } catch (e) { row.error = String(e && e.message || e); out.ok = false; }
    out.cases.push(row);
  }
  return out;
}

// URGENT REGRESSION GUARDS (Oct 2026, CLK DTM job; CLK DTM case RE-WRITTEN Part 7 golden-cars job,
// Oct 2026 - the mechanism it originally guarded no longer exists). Two live defects found this
// round, guarded so neither can silently come back:
//  1. ORIGINAL DEFECT (historical): classEraGuarded's wide-band guard used to swap the REAL
//     marque-decade class-era population for a narrow title-keyword-only match on the car's own
//     name, mislabeled under the SAME class_era tier - "2005 Mercedes-Benz CLK DTM" went from a
//     real population in the thousands to 13. class_era (classEraGuarded/assessClassEra) was
//     DELETED later the same session (Round 5 Lane B job - every caller reads the model-any-year/
//     sibling rescue instead), so `tier === "class_era"` can never be true again and the original
//     assertion would fail PERMANENTLY, not on a real regression - stale, not a live guard. CLK DTM's
//     correct tier today is "thin" (assessThin, houseSteer true - online-liquidity-gated, a
//     different and still-live mechanism). Re-written to assert the CURRENT correct shape: thin
//     tier, a real pool (not empty), and every card's own title actually names CLK and DTM (the
//     "swap" this guard cares about - a wrong, unrelated pool silently substituted - is still a
//     real risk under the thin/houseSteer path, just not via the deleted class_era tier). The old
//     "factsBlock must never carry a dollar figure" half is DROPPED, not replaced: product rule 23/
//     24 since evolved to ALLOW a thin pool's lowest/highest once n>=8 (docs/golden-rules.md,
//     "Sold between $X and $Y" - Lane A's thin-tier sold-between line, confirmed live) - asserting
//     "dollar-free" now would fail on correct, intended behaviour, not a regression.
//  2. A single sales_archive row (BaT listing #176322) carries OldCarsData's own upstream
//     mislabel - make="Merkur"/model="XR4Ti" on a real 1987 Ford Sierra RS Cosworth - corrected in
//     the archive (task=fixMerkurRow); this guards that it stays corrected (no "Sierra" title in
//     the Merkur XR4Ti pool).
export async function checkUrgentOct2026Guards(env) {
  const out = { ok: true, cases: [] };
  {
    const q = "2005 Mercedes-Benz CLK DTM";
    const row = { q, check: "clk_dtm_pool_not_swapped" };
    try {
      const rv = await resolveVehicle(q, {}), vehicle = rv && rv.vehicle;
      if (!vehicle || !vehicle.make) throw new Error("unresolved");
      const generation = await findGeneration(vehicle, env).catch(() => null);
      const d = await runOneBox(vehicle, generation, q, env, null);
      row.tier = d.tier;
      const titles = (d.cards || []).map(c => String(c.title || ""));
      row.cardCount = titles.length;
      const clkDtmTitled = titles.filter(t => /\bclk\b/i.test(t) && /\bdtm\b/i.test(t)).length;
      row.clkDtmTitled = clkDtmTitled;
      row.pass = row.tier === "thin" && titles.length > 0 && clkDtmTitled === titles.length;
      if (!row.pass) out.ok = false;
    } catch (e) { row.error = String(e && e.message || e); out.ok = false; }
    out.cases.push(row);
  }
  {
    const q = "Merkur XR4Ti";
    const row = { q, check: "no_sierra_contamination" };
    try {
      const rv = await resolveVehicle(q, {}), vehicle = rv && rv.vehicle;
      if (!vehicle || !vehicle.make) throw new Error("unresolved");
      const generation = await findGeneration(vehicle, env).catch(() => null);
      const d = await runOneBox(vehicle, generation, q, env, null);
      const titles = (d.cards || []).map(c => String(c.title || ""));
      row.cardTitles = titles;
      row.pass = !titles.some(t => /\bsierra\b/i.test(t));
      if (!row.pass) out.ok = false;
    } catch (e) { row.error = String(e && e.message || e); out.ok = false; }
    out.cases.push(row);
  }
  return out;
}

// OVER-TIME INVARIANTS (job 4, Oct 2026 addendum): the trailing-period rows plus rowsNotShownCount
// must sum to EXACTLY the headline count, and - when the window is exactly 12 months (useRecent) -
// the full trailing span's own range must equal the headline cluster. Confirmed live before the fix:
// a 2005 BMW M3 Coupe's four calendar-quarter rows summed to 71/63 against an 87 headline on
// different runs - the SAME pool-consistency bug as job 3's split, fixed the same way.
export const OVER_TIME_CASES = ["2002 to 2006 BMW M3 Coupe", "2008 Porsche 997 Carrera S"];
export async function checkOverTimeInvariants(env, cases = OVER_TIME_CASES) {
  const out = { ok: true, cases: [] };
  for (const q of cases) {
    const row = { q };
    try {
      const rv = await resolveVehicle(q, {}), vehicle = rv && rv.vehicle;
      if (!vehicle || !vehicle.make) throw new Error("unresolved");
      const generation = await findGeneration(vehicle, env).catch(() => null);
      const d = await runOneBox(vehicle, generation, q, env, null);
      row.headline = d.soldCount;
      row.cluster = d.cluster || null;
      const periods = Array.isArray(d.quarterlyBands) ? d.quarterlyBands : [];
      const shownSum = periods.reduce((s, p) => { const n = /\d+/.test(String(p.count)) ? Number(p.count) : ({ zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }[p.count] ?? null); return s + (Number.isFinite(n) ? n : 0); }, 0);
      row.shownSum = shownSum; row.rowsNotShownCount = d.rowsNotShownCount || 0;
      if (periods.length) {
        row.sumsToHeadline = Number.isFinite(d.soldCount) && (shownSum + row.rowsNotShownCount) === d.soldCount;
        if (!row.sumsToHeadline) out.ok = false;
      } else row.sumsToHeadline = null;
    } catch (e) { row.error = String(e && e.message || e); out.ok = false; }
    out.cases.push(row);
  }
  return out;
}

// IDENTITY QUESTION CAPTURE (Round 5 Job 2, Oct 2026): reusable, permanent sweep infrastructure -
// "which identity question fired" was not previously recorded anywhere (checkOneSpec's own
// marketCheckLane deliberately calls asked:2 to bypass these questions entirely, by design, for
// the cross-lane consistency check; that is a DIFFERENT question from this one). This calls
// runOneBox at asked:0 (the real first-visit read every product's identity question actually
// renders from) and records which of the four splitMaterial-gated blocking tiers (body_choice,
// gearbox_choice, variant_choice, dochistory_choice) fired, if any - plus its per-side counts, so
// a materiality-rule change (like this round's ratio -> no-overlap swap) can be diffed spec by
// spec, dimension by dimension, reproducibly, instead of re-run-and-eyeball. generation_choice is
// intentionally excluded: it is gated by generation-count ambiguity, not splitMaterial, and is
// unaffected by any materiality rule change.
//
// ALSO captures d.inlineSplits: a year-pinned spec (spec.genPinnedByYear, the common shape in
// DEFAULT_SPECS - most entries name an explicit year) or a question-capped one converts the SAME
// splitMaterial decision into a non-blocking inline split instead of a blocking tier (see
// runOneBox's own "year pinned the generation... go straight to a result" comment) - without this,
// a materiality-rule change would look like it has NO effect on most of this sweep, when the real
// effect is showing up as an inline split appearing/disappearing, not a tier change.
const IDENTITY_TIERS = new Set(["body_choice", "gearbox_choice", "variant_choice", "dochistory_choice"]);
export async function checkIdentityQuestions(env, specs = DEFAULT_SPECS) {
  const out = [];
  for (const q of specs) {
    const row = { q, tier: null, dimension: null, options: null, counts: null, inlineSplits: null, error: null };
    try {
      const rv = await resolveVehicle(q, {}), vehicle = rv && rv.vehicle;
      if (!vehicle || !vehicle.make) throw new Error("unresolved");
      const generation = await findGeneration(vehicle, env).catch(() => null);
      const d = await runOneBox(vehicle, generation, q, { ...env, asked: 0 }, null);
      row.tier = (d && d.tier) || null;
      if (row.tier && IDENTITY_TIERS.has(row.tier)) {
        // TIER_DIMENSION (URGENT fix, Oct 2026, defect 4): the SAME lookup lib/onebox.js's own
        // identityQuestionFrom uses - a bare _choice-suffix strip gave "variant"/"dochistory"
        // where the documented contract says "competition"/"documented_history".
        row.dimension = TIER_DIMENSION[row.tier] || row.tier.replace(/_choice$/, "");
        row.options = d.generationOptions || d.gearboxOptions || d.bodyOptions || d.variantOptions || d.docHistoryOptions || null;
        row.counts = Array.isArray(d.optionCounts) ? d.optionCounts : null;
      }
      if (Array.isArray(d && d.inlineSplits) && d.inlineSplits.length) {
        row.inlineSplits = d.inlineSplits.map(s => ({ key: s.key, poolN: s.poolN, sides: (s.sides || []).map(x => ({ label: x.label, n: x.n, lo: x.lo, hi: x.hi })) }));
      }
    } catch (e) { row.error = String(e && e.message || e); }
    out.push(row);
  }
  return out;
}

// CACHE CONSISTENCY (Lane B job, Oct 2026, Part 1): a warm in-memory hit (lib/live/search.js
// rangeCache, via engineAnswer) must return the IDENTICAL answer a cold read would give right now -
// never a hit that outlived the epoch/version it was stamped under, and never a one-off bad read
// that got latched in and kept being served afterward. For every spec: call engineAnswer twice (the
// second call is guaranteed warm, same tick), then call oneEngineAnswer directly (bypassing
// rangeCache entirely, the same asked:0-then-asked:2 escalation engineAnswer itself does) for a
// genuinely fresh read, and compare the two on the fields a seller actually reads.
export async function checkCacheConsistency(env, specs = DEFAULT_SPECS) {
  const out = { ok: true, cases: [] };
  const fields = ["tier", "poolN", "low", "high", "fallbackRung", "rungLabel"];
  const shape = d => {
    const hasCluster = d && d.tier === "result" && Array.isArray(d.cluster);
    return { tier: (d && d.tier) || null, poolN: d && d.poolN != null ? d.poolN : null, low: hasCluster ? d.cluster[0] : null, high: hasCluster ? d.cluster[1] : null, fallbackRung: (d && d.fallbackRung) || null, rungLabel: (d && d.rungLabel) || null };
  };
  for (const q of specs) {
    const row = { q };
    try {
      const rv = await resolveVehicle(q, {}), vehicle = rv && rv.vehicle;
      if (!vehicle || !vehicle.make) throw new Error("unresolved");
      const generation = await findGeneration(vehicle, env).catch(() => null);
      const searchText = q;   // the typed words, as the pages pass them (see checkOneSpec)
      await engineAnswer(vehicle, generation, searchText, env, null);   // first call: may be cold, primes the cache
      const warm = await engineAnswer(vehicle, generation, searchText, env, null);   // second call: guaranteed warm
      const coldRun = async asked => (await oneEngineAnswer(vehicle, generation, searchText, { ...env, exactSale: null, asked }, null)).raw;
      let cold = await coldRun(0);
      if (cold && /_choice$/.test(String(cold.tier || ""))) cold = await coldRun(2);   // same escalation engineAnswer itself does
      const a = shape(warm), b = shape(cold);
      row.warm = a; row.cold = b;
      row.agree = fields.every(f => a[f] === b[f]);
      if (!row.agree) out.ok = false;
    } catch (e) { row.error = String(e && e.message || e); out.ok = false; }
    out.cases.push(row);
  }
  return out;
}

// FORM PAIRS (Sam, Oct 14 2026, Lane C's find): the same car typed two ways must give the same pool -
// same count, low and high from the engine. Nameplate vs chassis code today; extend with any pair.
export const FORM_PAIRS = [
  ["2008 Porsche 911 Carrera S Coupe", "2008 997 Carrera S Coupe"],
  ["2008 Porsche 997 Carrera S Coupe", "2008 997 Carrera S Coupe"],
  ["2014 Porsche 911 Carrera S", "2014 Porsche 991 Carrera S"]
];
export async function checkFormPairs(env, pairs = FORM_PAIRS) {
  const read = async q => {
    const rv = await resolveVehicle(q, {}), vehicle = rv && rv.vehicle;
    if (!vehicle || !vehicle.make) return { q, error: "unresolved" };
    const generation = await findGeneration(vehicle, env).catch(() => null);
    const a = await oneEngineAnswer(vehicle, generation, q, { ...env, exactSale: null, asked: 2 }, null);
    return { q, tier: a.answerType, count: a.poolSize, low: a.low, high: a.high, label: a.rungLabel };
  };
  const cases = [];
  for (const [p, q] of pairs) {
    const [a, b] = [await read(p), await read(q)];
    const same = !a.error && !b.error && a.count === b.count && a.low === b.low && a.high === b.high;
    cases.push({ pair: [p, q], same, a, b });
  }
  return { ok: cases.every(c => c.same), cases };
}
// IDENTITY COUNTS (e41, Sam's Job 1b): for every spec whose bare answer carries body options, open each option the way
// the page does (the same typed words with refine.body) and require the opened poolSize to equal the option's count,
// and the options plus the unspecified rows to equal the bare pool.
export async function checkIdentityCounts(env, specs = DEFAULT_SPECS) {
  const cases = [];
  for (const q of specs) {
    const rv = await resolveVehicle(q, {}).catch(() => null), vehicle = rv && rv.vehicle;
    if (!vehicle || !vehicle.make) continue;
    const generation = await findGeneration(vehicle, env).catch(() => null);
    const bare = await oneEngineAnswer(vehicle, generation, q, { ...env, exactSale: null, asked: 2 }, null);
    const d = bare && bare.raw;
    if (!d || !Array.isArray(d.bodyOptions) || !d.bodyOptions.length) continue;
    const poolN = Number.isFinite(d.poolN) ? d.poolN : (d.rawPool || []).length;
    const sum = d.bodyOptions.reduce((s, o) => s + (Number(o.inPool) || 0), 0) + (Number(d.bodyUnspecified) || 0);
    const options = [];
    for (const o of d.bodyOptions) {
      const opened = await oneEngineAnswer(vehicle, generation, q, { ...env, exactSale: null, asked: 2 }, { body: o.value });
      // ONE ENGINE (e53, Sam's addition 1): the same option through engineAnswer, the path Buy's cards and Tasks read
      // (rangeCache + the stored row, keyed on the refine since e49), must open the same count; the "Body not stated"
      // page must leave the car's bodyStyle null on both paths.
      const buy = await engineAnswer(vehicle, generation, q, env, { body: o.value }).catch(() => undefined);
      const buyN = buy && Number.isFinite(buy.poolN) ? buy.poolN : (buy && Array.isArray(buy.cards) ? buy.cards.length : null);
      const openedBody = opened.raw && opened.raw.resolvedCar ? opened.raw.resolvedCar.bodyStyle : null;
      const buyBody = buy && buy.resolvedCar ? buy.resolvedCar.bodyStyle : null;
      const bodyOk = o.value === "unspecified" ? (openedBody == null && buyBody == null) : true;
      options.push({ label: o.label, value: o.value, n: o.n, opened: opened.poolSize, buyOpened: buyN, same: opened.poolSize === o.n && buyN === o.n && bodyOk && o.n >= 1, openedLabel: opened.rungLabel, openedBody, buyBody });
    }
    cases.push({ q, poolN, sum, unspecified: Number(d.bodyUnspecified) || 0, sumOk: sum === poolN, options, ok: sum === poolN && options.every(x => x.same) });
  }
  return { ok: cases.every(c => c.ok), cases };
}
export async function runEngineCheck(env, specs = DEFAULT_SPECS, opts = {}) {
  const rows = [];
  for (const q of specs) rows.push(await checkOneSpec(q, env));
  const totalMismatches = rows.filter(r => r.anyMismatch).length;
  const singlePick = opts.singlePick === false ? null : await checkSinglePick(env).catch(e => ({ ok: false, error: String(e && e.message || e) }));
  const buyPaths = opts.buyPaths === false ? null : await checkBuyPaths(env).catch(e => ({ ok: false, error: String(e && e.message || e) }));
  const liveFences = opts.liveFences === false ? null : await checkLiveComparableFences(env).catch(e => ({ ok: false, error: String(e && e.message || e) }));
  const representative = opts.representative === false ? null : await checkRepresentativeInvariants(env).catch(e => ({ ok: false, error: String(e && e.message || e) }));
  const splitPools = opts.splitPools === false ? null : await checkSplitPoolInvariants(env).catch(e => ({ ok: false, error: String(e && e.message || e) }));
  const overTime = opts.overTime === false ? null : await checkOverTimeInvariants(env).catch(e => ({ ok: false, error: String(e && e.message || e) }));
  const liveListing = opts.liveListing === false ? null : await checkLiveListingDisclosure(env).catch(e => ({ ok: false, error: String(e && e.message || e) }));
  const urgentOct2026 = opts.urgentOct2026 === false ? null : await checkUrgentOct2026Guards(env).catch(e => ({ ok: false, error: String(e && e.message || e) }));
  const cacheConsistency = opts.cacheConsistency === false ? null : await checkCacheConsistency(env, specs).catch(e => ({ ok: false, error: String(e && e.message || e) }));
  const specKeyYearIsolation = opts.specKeyYearIsolation === false ? null : checkSpecKeyYearIsolation();
  const refineKeyIsolation = opts.refineKeyIsolation === false ? null : checkRefineKeyIsolation();
  const refineIsolation = opts.refineIsolation === false ? null : await checkRefineIsolation(env).catch(e => ({ ok: false, error: String(e && e.message || e) }));
  const formPairs = opts.formPairs === false ? null : await checkFormPairs(env).catch(e => ({ ok: false, error: String(e && e.message || e) }));
  const identityCounts = opts.identityCounts === false ? null : await checkIdentityCounts(env, specs).catch(e => ({ ok: false, error: String(e && e.message || e) }));
  return { task: "crossproductcheck", formPairs, identityCounts, total: rows.length, mismatchSpecs: totalMismatches, singlePick, buyPaths, liveFences, representative, splitPools, overTime, liveListing, urgentOct2026, cacheConsistency, refineKeyIsolation, refineIsolation, specKeyYearIsolation, rows };
}

// ---- CLI ----
function printTable(result) {
  for (const row of result.rows) {
    console.log(`\n=== ${row.q}` + (row.resolved ? `  (resolved: ${row.resolved})` : ""));
    if (row.error) { console.log("  ERROR:", row.error); continue; }
    for (const [name, lane] of Object.entries(row.lanes)) {
      if (!lane.ok) console.log(`  ${name.padEnd(12)} NO READ - ${lane.reason}`);
    }
    for (const c of row.compare) {
      const flag = c.status === "MISMATCH" ? " <<<<" : "";
      console.log(`  ${c.field.padEnd(8)} ${c.status.padEnd(9)} ${c.detail}${flag}`);
    }
    for (const c of (row.countsCompare || [])) {
      const flag = c.status === "MISMATCH" ? " <<<<" : "";
      console.log(`  ${c.field.padEnd(13)} ${c.status.padEnd(9)} ${c.detail}${flag}`);
    }
    if (row.abroad) console.log(`  abroad   live matches=${row.abroad.liveMatches ?? "?"} (${row.abroad.note || row.abroad.error})`);
    for (const r of (row.reasons || [])) console.log(`  reason:  ${r}`);
  }
  console.log(`\nTOTAL: ${result.mismatchSpecs}/${result.total} specs had at least one field mismatch`);
  if (result.singlePick) console.log(`ONE PICK: ${result.singlePick.ok ? "PASS" : "FAIL"} ${JSON.stringify(result.singlePick)}`);
  if (result.buyPaths) console.log(`BUY PATHS: ${result.buyPaths.ok ? "PASS" : "FAIL"} ${JSON.stringify(result.buyPaths)}`);
  if (result.liveFences) console.log(`LIVE FENCES: ${result.liveFences.ok ? "PASS" : "FAIL"} ${JSON.stringify(result.liveFences)}`);
  if (result.representative) console.log(`REPRESENTATIVE: ${result.representative.ok ? "PASS" : "FAIL"} ${JSON.stringify(result.representative)}`);
  if (result.splitPools) console.log(`SPLIT POOLS: ${result.splitPools.ok ? "PASS" : "FAIL"} ${JSON.stringify(result.splitPools)}`);
  if (result.overTime) console.log(`OVER TIME: ${result.overTime.ok ? "PASS" : "FAIL"} ${JSON.stringify(result.overTime)}`);
  if (result.liveListing) console.log(`LIVE LISTING: ${result.liveListing.ok ? "PASS" : "FAIL"} ${JSON.stringify(result.liveListing)}`);
  if (result.cacheConsistency) console.log(`CACHE CONSISTENCY: ${result.cacheConsistency.ok ? "PASS" : "FAIL"} ${JSON.stringify(result.cacheConsistency)}`);
  if (result.refineKeyIsolation) console.log(`REFINE KEY ISOLATION: ${result.refineKeyIsolation.ok ? "PASS" : "FAIL"} ${JSON.stringify(result.refineKeyIsolation.cases.map(c => [c.name, c.pass]))}`);
  if (result.refineIsolation) console.log(`REFINE ISOLATION (live): ${result.refineIsolation.ok ? "PASS" : "FAIL"} ${JSON.stringify(result.refineIsolation)}`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argSpecs = process.argv.find(a => a.startsWith("--specs="));
  const asJson = process.argv.includes("--json");
  const specs = argSpecs ? argSpecs.slice("--specs=".length).split("|").filter(Boolean) : DEFAULT_SPECS;
  const env = supabaseEnv();
  if (!env) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set."); process.exit(2); }
  const result = await runEngineCheck(env, specs);
  if (asJson) console.log(JSON.stringify(result));
  else printTable(result);
  process.exit(result.mismatchSpecs > 0 || (result.singlePick && !result.singlePick.ok) || (result.buyPaths && !result.buyPaths.ok) || (result.liveFences && !result.liveFences.ok) || (result.representative && !result.representative.ok) || (result.splitPools && !result.splitPools.ok) || (result.overTime && !result.overTime.ok) || (result.liveListing && !result.liveListing.ok) || (result.cacheConsistency && !result.cacheConsistency.ok) ? 1 : 0);
}
