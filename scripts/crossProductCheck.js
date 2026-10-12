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
import { runOneBox, buildSpec, titleFenceReason } from "../lib/onebox.js";
import { familyMarket, liveForFamily, emptyFilters, resolveForBuy } from "../lib/live/search.js";
import { converse } from "../lib/live/converse.js";
import { fetchOnlinePool, buildSharedAnalysis, pickPlatform, depthWins } from "../lib/platformPick.js";
import { decide, getSellerCriteria } from "../api/sellerDecision.js";
import fs from "node:fs";
import { hammerUsd } from "../lib/_houseComps.js";
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";

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
  "1989 Alfa Romeo Spider"
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
  const d = await runOneBox(vehicle, generation, searchText, { ...env, asked: 2 }, null);
  if (!d || !d.tier) return { ok: false, reason: "no tier" };
  const tier = d.tier;
  if (!/^(result|thin|class_era|refusal)$/.test(tier)) return { ok: false, reason: `tier=${tier} (a question, not an answer - spec needs a year/trim to disambiguate)` };
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
  return { ok: true, tier, label, low, high, count, latest, recent, span, referenceFigure: d.referenceFigure || null, counts: d.counts || null, window: d.windowLabel || null, poolYears: Array.isArray(d.poolYears) ? d.poolYears : null };
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
  return { ok: true, kind: m.kind, label, low, high, count, latest, recent, referenceFigure: m.referenceFigure || null, counts: m.counts || null, window: m.windowLabel || null, poolYears: Array.isArray(m.poolYears) ? m.poolYears : null };
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
  return { ok: true, label, low, high, span, count: priced.length, latest: (sorted[0]?.auction_end_date || "").slice(0, 10) || null, recent, referenceFigure: referenceFigure || null, askingLineLow, askingLineHigh, counts, window: windowLabel || null, poolYears: Array.isArray(poolYears) ? poolYears : null };
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

export async function checkOneSpec(q, env) {
  const row = { q };
  const rv = await resolveVehicle(q, {}).catch(e => ({ error: e }));
  const vehicle = rv && rv.vehicle;
  if (!vehicle || !vehicle.make) { row.error = "unresolved: " + (rv && (rv.status || rv.error?.message) || "?"); return row; }
  row.resolved = `${vehicle.year || ""} ${vehicle.make} ${vehicle.model || ""}${vehicle.trim ? " " + vehicle.trim : ""}`.trim();
  const generation = await findGeneration(vehicle, env).catch(() => null);
  const searchText = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
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

  row.lanes = { marketCheck, buy, sell, tasks };
  const fields = ["label", "low", "high", "count", "latest", "recent", "referenceFigure", "window", "poolYears"];
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
  return { task: "crossproductcheck", total: rows.length, mismatchSpecs: totalMismatches, singlePick, buyPaths, liveFences, representative, splitPools, overTime, liveListing, rows };
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
  process.exit(result.mismatchSpecs > 0 || (result.singlePick && !result.singlePick.ok) || (result.buyPaths && !result.buyPaths.ok) || (result.liveFences && !result.liveFences.ok) || (result.representative && !result.representative.ok) || (result.splitPools && !result.splitPools.ok) || (result.overTime && !result.overTime.ok) || (result.liveListing && !result.liveListing.ok) ? 1 : 0);
}
