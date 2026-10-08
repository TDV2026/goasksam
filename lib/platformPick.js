// SHARED platform pick (Oct 2026, one engine rule item). Live /sell (api/sellerDecision.js
// analyzeRouteFit -> pickRecommendedRoute) and the new Sell (lib/sell/sellFacts.js placesFor)
// picked a platform with two different functions reading two different pools, so the same car
// could get two different answers depending which page a seller landed on. This file is the one
// shared function both pages call for the ONLINE-PLATFORM pick. It runs the OLD ladder's rules and
// thresholds (premium, then specialist, then depth leader - see pickRecommendedRoute's comment in
// api/sellerDecision.js for the branch names) UNCHANGED, but reads them off the SAME shared-engine
// pool Market Check uses (buildSpec/fetchQualifying/qualifyReason, generation-bound, online-only,
// Market Check's own window), not the old OldCarsData/vehicle_market_records evidence or the new
// Sell's own 12-month generation+body pool.
//
// Scoped simplifications from the full old ladder (documented, not hidden - see docs/lane-notes.md
// for the full note to Lane C): this reads ONE window (Market Check's, 730 days -> an exact-year
// rung first when a trim + multi-year generation exist -> 1825 if still thin -> all-time only if
// still EMPTY), not sellerDecision.js's multi-window, multi-scope walk (45/90/180/.../segment
// fallback). It implements the symmetric premium gate (>=10%, 5v5) AND the asymmetric market-
// dominance gate (75%+ share, 10+ combined sample) - both ported after the Oct 2026 40-car audit
// showed their absence flips real picks - but NOT the volume-aware sample/margin refinement on
// Branch 1, the thin-window price-signal override, or the curated win-condition table - those are
// real mechanisms in the old ladder this does NOT port. The thresholds (10% symmetric gap at 5v5;
// 75% asymmetric share at 10+ combined; specialist lift>=3x at 5+ scope comps; most sold comps at
// the landed scope) are unchanged from the real code.
import { buildSpec, fetchQualifying, houseReceiptsForVehicle } from "./onebox.js";
import { hammerUsd, isHouseSource, sourceSlugOf } from "./_houseComps.js";
import { buildHouseComparison } from "./houseCalendar.js";
import { findSpecializationContext } from "./specializationShare.js";
import { MODEL_SEGMENTS } from "./vehicleData.js";
import { houseName } from "../api/_historyData.js";

const ONLINE_MIN = 5;           // below this the online pool is too thin to rank platforms at all
const PREMIUM_MIN_SAMPLE = 5;   // "5 vs 5 samples" (item 1, unchanged from the old ladder's gate)
const PREMIUM_GAP_PCT = 10;     // "10% or more" (item 1, unchanged)
const SPEC_LIFT_MIN = 3;        // specializationCell.lift_rounded >= 3x (unchanged)
const SPEC_COUNT_MIN = 5;       // specializationCell.platform_count >= 5 (unchanged)
const SPEED_EVIDENCE_FLOOR = 3; // same floor js/result-v2.js's v2Composition used for a speed pick
// Item 2 (house window): standardized on 36 months, live /sell's EXISTING window (houseReceiptsForVehicle's
// HT_WINDOW_DAYS), not the new Sell's 12-month default. Auction houses sell a given model far less often
// than online platforms do - a 12-month window regularly starves the comparison (the new Sell's own
// placesFor already widens to 36mo whenever its 12mo pool reads under 3 sales, i.e. it already reaches
// for 36mo as a fallback). Standardizing on 36 everywhere widens the new Sell's house record (a real gain,
// zero regression risk) rather than narrowing live /sell's already-shipped, already-tested behavior.
const HOUSE_WINDOW_DAYS = 1095;

const norm = s => String(s || "").toLowerCase().trim();
const median = arr => { const s = arr.slice().sort((a, b) => a - b), n = s.length; if (!n) return null; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const isBaTSlug = slug => /^bringatrailer$/.test(norm(slug));

// Rush (item 3, ported from js/result-v2.js sellerWantsSpeed - same regex, so a seller's timeline
// text reads identically on both pages). "No rush" / "not in a rush" / "right result" must win over
// the word "rush" appearing inside "no rush".
export function wantsSpeed(timelineText) {
  const t = norm(timelineText);
  if (/\bno (rush|hurry)\b|not in a (rush|hurry)|right result/i.test(t)) return false;
  return /\b(fast|quick|soon|tomorrow|this week|gone|asap|urgent|rush)\b/i.test(t) || /within a month/i.test(t);
}
function wantsHouse(criteria) {
  return criteria && (criteria.sellerPreference === "auction_house" || /auction house/i.test(String(criteria.involvement || "")));
}

// ONE shared-engine pool, online platforms only (houses are a separate mode, item 2) - same
// buildSpec/fetchQualifying/qualifyReason fence stack Market Check's own ladder calls, generation-
// bound (spec.yearMin/yearMax from the resolved generation), same trim/body scoping.
async function fetchOnlinePool(vehicle, generation, env) {
  const searchText = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  const spec = buildSpec(vehicle, generation, searchText);
  if (!spec || !spec.make) return { spec: null, pool: [], windowDays: null, windowLabel: null, thin: false };
  // Trim-title scope (same pattern priceBandForVehicle/listSalesForVehicle use, lib/onebox.js):
  // buildSpec does not set titleContains itself for a plain (non-performance-badge) named trim, so
  // without this a "Carrera S" or "Fastback" query would read the whole model, not the named trim.
  const trimTok = vehicle.trim && String(vehicle.trim).trim() ? String(vehicle.trim).trim() : "";
  if (trimTok && !spec.titleContains && !spec.perfInclude && !spec.badge) spec.titleContains = trimTok;
  // Item 2 (Oct 2026 follow-up, Model A case): no named trim AND no curated generation is the one
  // case buildSpec's own fallback (year +/- 2) still pools MORE than one model year. The old ladder's
  // own first rung for a plain, ungenerationed model is the LITERAL model year, not a +/-2 band or
  // the whole nameplate - force that here so this and the old ladder read the same scope.
  if (!spec.titleContains && !spec.perfInclude && !spec.badge && !(generation && generation.yearStart && generation.yearEnd) && Number(vehicle.year)) {
    spec.yearMin = Number(vehicle.year); spec.yearMax = Number(vehicle.year);
  }
  const fetchWith = async (useSpec, days) => {
    const sinceIso = new Date(Date.now() - days * 864e5).toISOString();
    const rows = await fetchQualifying(useSpec, sinceIso, env, {}).catch(() => []);
    return (rows || []).filter(r => !isHouseSource(r.source));
  };
  const fetchAt = days => fetchWith(spec, days);
  let pool, windowDays, windowLabel, thin = false;
  // Item 4/5 (Oct 2026 audit): the EXACT-YEAR rung, ported from the old ladder's own rung order
  // (exact_year_trim tried before generation_trim). Only a real second rung when a named trim AND a
  // curated multi-year generation both exist (otherwise exact-year and generation-bound are the same
  // scope already, via item 2's fix for the no-trim/no-generation case - no point double-fetching).
  // The audit found this gate's absence flips the pick on common cars (a specific model year with
  // thin Cars & Bids coverage outranking Bring a Trailer's deep GENERATION-wide volume, because the
  // exact year itself has too few BaT sales) - ported so both ladders ask the same first question.
  const exactYearWorthTrying = trimTok && generation && Number.isFinite(Number(generation.yearStart)) && Number.isFinite(Number(generation.yearEnd))
    && Number(generation.yearStart) !== Number(generation.yearEnd) && Number(vehicle.year);
  if (exactYearWorthTrying) {
    const yearSpec = { ...spec, yearMin: Number(vehicle.year), yearMax: Number(vehicle.year) };
    const exact = await fetchWith(yearSpec, 730);
    if (exact.length >= ONLINE_MIN) { pool = exact; windowDays = 730; windowLabel = "the exact model year"; }
  }
  if (!pool) {
    pool = await fetchAt(730); windowDays = 730; windowLabel = "the past 2 years";
    if (pool.length < ONLINE_MIN) {
      const wide = await fetchAt(1825);
      if (wide.length > pool.length) { pool = wide; windowDays = 1825; windowLabel = "the past 5 years"; }
    }
  }
  // Item 1 (Oct 2026 follow-up, CLK DTM Cabriolet case): the shared 730/1825-day window still missed
  // a halo this rare's one real sale, while the old ladder's effectively unbounded landed-rung window
  // found it. Third widen step, ALL TIME, ONLY when the pool is still genuinely EMPTY (never to pad a
  // thin-but-nonzero pool wider than it needs to be). thin=true marks the result so the page copy can
  // say plainly it rests on very few sales - never silently dressed up as a normal-window pick.
  if (pool.length === 0) {
    const allTime = await fetchAt(36500);
    if (allTime.length > 0) { pool = allTime; windowDays = 36500; windowLabel = "all time"; thin = true; }
  }
  return { spec, pool, windowDays, windowLabel, thin };
}

function platformTallies(pool) {
  const byPlatform = new Map();
  for (const r of pool) {
    const slug = sourceSlugOf(r.source) || norm(r.source);
    if (!slug) continue;
    const price = hammerUsd(r);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (!byPlatform.has(slug)) byPlatform.set(slug, []);
    byPlatform.get(slug).push(price);
  }
  return byPlatform;
}

// Branch 1: the highest CLEARED symmetric premium (>=10%, 5v5) leads.
function premiumPick(byPlatform, exclude) {
  const platforms = [...byPlatform.keys()].filter(p => !exclude.has(p));
  let best = null;
  for (const p of platforms) {
    const mine = byPlatform.get(p);
    const others = platforms.filter(q => q !== p).flatMap(q => byPlatform.get(q));
    if (mine.length < PREMIUM_MIN_SAMPLE || others.length < PREMIUM_MIN_SAMPLE) continue;
    const mMine = median(mine), mOthers = median(others);
    if (!(mOthers > 0)) continue;
    const gap = Math.round((mMine - mOthers) / mOthers * 100);
    if (gap >= PREMIUM_GAP_PCT && (!best || gap > best.percent)) {
      best = { platform: p, percent: gap, platformSales: mine.length, othersSales: others.length };
    }
  }
  return best;
}
// Asymmetric market-dominance gate (item 5, audit-driven port): pricePremiumFor's OTHER gate in the
// real code - a platform the "others" sample is too thin to compare against (<5) but which still
// holds 75%+ of a real combined sample (10+) IS a measured, real signal (overwhelming share), not a
// case for the specialist branch to override. Audit case: 1967 Mustang Fastback - Bring a Trailer had
// 25 sales to everyone else's 3 combined (89% share); without this gate `anyMeasured` saw no 5v5
// symmetric comparison anywhere and let a precomputed specialist cell (Hagerty, lift 3x on 18 ALL-TIME
// comps, nothing to do with this car's actual pool) outrank BaT's obvious depth. Mirrors
// pricePremiumFor's own asymmetric branch (gateType "asymmetric", type "market_dominance") exactly.
const DOMINANCE_SHARE_PCT = 75, DOMINANCE_TOTAL_MIN = 10;
function dominancePick(byPlatform, exclude) {
  const platforms = [...byPlatform.keys()].filter(p => !exclude.has(p));
  let best = null;
  for (const p of platforms) {
    const mine = byPlatform.get(p);
    const others = platforms.filter(q => q !== p).flatMap(q => byPlatform.get(q));
    const total = mine.length + others.length;
    if (mine.length < PREMIUM_MIN_SAMPLE || others.length >= PREMIUM_MIN_SAMPLE || total < DOMINANCE_TOTAL_MIN) continue;
    const share = Math.round((mine.length / total) * 100);
    if (share >= DOMINANCE_SHARE_PCT && (!best || mine.length > best.platformSales)) {
      best = { platform: p, marketShare: share, platformSales: mine.length, othersSales: others.length };
    }
  }
  return best;
}
// "measured" per pickRecommendedRoute: some platform has either a symmetric 5v5 comparison OR a
// clear asymmetric dominance share. Specialist only ever stands in when NEITHER exists anywhere.
function anyMeasured(byPlatform, exclude) {
  const platforms = [...byPlatform.keys()].filter(p => !exclude.has(p));
  const symmetric = platforms.some(p => byPlatform.get(p).length >= PREMIUM_MIN_SAMPLE
    && platforms.filter(q => q !== p).reduce((n, q) => n + byPlatform.get(q).length, 0) >= PREMIUM_MIN_SAMPLE);
  return symmetric || !!dominancePick(byPlatform, exclude);
}
// Branch 3: most sold comps at the landed scope.
function depthPick(byPlatform, exclude) {
  let best = null, bestN = -1;
  for (const [p, prices] of byPlatform) {
    if (exclude.has(p)) continue;
    if (prices.length > bestN) { bestN = prices.length; best = p; }
  }
  return best ? { platform: best, evidenceSales: bestN } : null;
}
// Branch 2: specialist crown (lift>=3x, 5+ scope comps), never the depth leader, only when no
// premium is measurable anywhere. Reuses the SAME precomputed SPECIALIZATION_CELLS table
// (lib/specializationShare.js) the old ladder reads - zero drift, not re-derived.
function specialistPick(byPlatform, vehicle, generation, exclude, depthPlatform) {
  const familyOf = m => norm(String(m || "").split(/\s+/)[0]);
  const seg = MODEL_SEGMENTS.find(s => norm(s.make) === norm(vehicle.make) && s.models.some(m => familyOf(m) === familyOf(vehicle.model)));
  const scopeQuery = { rung: "model", make: vehicle.make, model: vehicle.model, generationCode: (generation && generation.code) || null, segmentKey: (seg && seg.key) || null };
  // Candidate order approximates the old ladder's score-sorted `routable.find(...)` (highest-ranked
  // first) using pool size as the proxy, since this function has no multi-factor score to sort by.
  const candidates = [...byPlatform.entries()].filter(([slug]) => !exclude.has(slug) && slug !== depthPlatform).sort((a, b) => b[1].length - a[1].length);
  for (const [slug] of candidates) {
    const display = houseName(slug) || slug;
    const cell = findSpecializationContext(display, scopeQuery);
    if (cell && Number(cell.lift_rounded) >= SPEC_LIFT_MIN && Number(cell.platform_count) >= SPEC_COUNT_MIN) return { platform: slug, cell };
  }
  return null;
}

// The 3-branch ladder (premium -> specialist -> depth), optionally excluding a set of platforms
// (used by rush to exclude BaT - item 3). Returns null if the pool has nothing to rank at all.
function runLadder(byPlatform, vehicle, generation, exclude) {
  if (![...byPlatform.keys()].some(p => !exclude.has(p))) return null;
  const premium = premiumPick(byPlatform, exclude);
  if (premium) return { platform: premium.platform, reasonCode: "premium", figures: { percent: premium.percent, platformSales: premium.platformSales, othersSales: premium.othersSales } };
  const dominance = dominancePick(byPlatform, exclude);
  if (dominance) return { platform: dominance.platform, reasonCode: "premium", figures: { type: "market_dominance", marketShare: dominance.marketShare, platformSales: dominance.platformSales, othersSales: dominance.othersSales } };
  const depth = depthPick(byPlatform, exclude);
  if (!anyMeasured(byPlatform, exclude)) {
    const specialist = specialistPick(byPlatform, vehicle, generation, exclude, depth && depth.platform);
    if (specialist) return { platform: specialist.platform, reasonCode: "specialist", figures: { liftRounded: specialist.cell.lift_rounded, platformCount: specialist.cell.platform_count, scopeLabel: specialist.cell.scope_label } };
  }
  if (depth) return { platform: depth.platform, reasonCode: "depth", figures: { evidenceSales: depth.evidenceSales } };
  return null;
}

// ---------------------------------------------------------------- the public function
// pickPlatform(vehicle, generation, env, criteria) -> the shared pick for BOTH pages.
//   mode: "house" | "online"
//   platform: source slug ("bringatrailer", "pcarmarket", ...)
//   platformDisplay: display name ("Bring a Trailer", "PCarMarket", ...)
//   reasonCode: "premium" | "specialist" | "depth" | "speed" | "house"
//   figures: the numbers behind the pick (branch-specific)
//   evidenceSales: the WINNING platform's own sale count (top-level, not just buried in figures)
//   thin: true when the online pick only exists because of the all-time widen step (item 1) - the
//     page copy should say plainly it rests on very few sales whenever this is true
//   byPlatform: { slug: { evidenceSales, medianHammer } } - every platform's own figures, for the card
//   pool: { windowDays, windowLabel, thin } - what window the online pick was read from
//   houseComparison: buildHouseComparison() output, present whenever the house branch ran
export async function pickPlatform(vehicle, generation, env, criteria = {}) {
  const asap = wantsSpeed(criteria.timeline);

  // Item 2: an auction house is ONLY ever picked when the seller explicitly chose "through an
  // auction house" (rules 10 and 22e) - never on sales count alone. One shared 36-month house
  // receipts window for both pages (see the note below).
  if (wantsHouse(criteria)) {
    const hr = await houseReceiptsForVehicle(vehicle, generation, env).catch(() => null);
    const hc = buildHouseComparison((hr && hr.houseReceipts) || [], { todayISO: new Date().toISOString().slice(0, 10), asap });
    if (!hc || !hc.houses.length) return { mode: "house", platform: null, platformDisplay: null, reasonCode: "house", figures: { houseWindowDays: HOUSE_WINDOW_DAYS, totalHouse: 0 }, evidenceSales: 0, thin: false, byPlatform: {}, pool: null, houseComparison: hc };
    const lead = (asap && hc.asapLead && hc.houses.find(h => h.slug === hc.asapLead)) || hc.houses[0];
    return {
      mode: "house", platform: lead.slug, platformDisplay: lead.display,
      reasonCode: asap && lead.slug === hc.asapLead && hc.houses[0].slug !== lead.slug ? "speed" : "house",
      figures: { count: lead.count, totalHouse: hc.totalHouse, houseWindowDays: HOUSE_WINDOW_DAYS, nextSale: lead.nextSale || null },
      evidenceSales: lead.count, thin: false,
      byPlatform: Object.fromEntries(hc.houses.map(h => [h.slug, { evidenceSales: h.count, medianHammer: h.median }])),
      pool: null, houseComparison: hc
    };
  }

  const { spec, pool, windowDays, windowLabel, thin } = await fetchOnlinePool(vehicle, generation, env);
  // Better nothing than a fake number: fetchOnlinePool already tried 730 -> 1825 -> all-time: a pool
  // still empty after all three means genuinely zero sales on record, not a thin read. No pick.
  if (!spec || !pool.length) return { mode: "online", platform: null, platformDisplay: null, reasonCode: null, figures: {}, evidenceSales: 0, thin: false, byPlatform: {}, pool: { windowDays: windowDays || null, windowLabel: windowLabel || null, thin: false }, houseComparison: null };
  const byPlatform = platformTallies(pool);
  const byPlatformOut = Object.fromEntries([...byPlatform.entries()].map(([slug, prices]) => [slug, { evidenceSales: prices.length, medianHammer: median(prices) }]));

  const baseline = runLadder(byPlatform, vehicle, generation, new Set());
  let result = baseline;

  // Item 3 (rush): the online speed pick, ported from js/result-v2.js v2Composition/sellerWantsSpeed.
  // Re-run the SAME ladder with Bring a Trailer excluded (slower to list); if the result clears the
  // same evidence floor the frontend used (3), it leads and is tagged reasonCode "speed" so the
  // reason sentence can say why. Never promotes a house (houses are not in this pool at all - 22e
  // holds by construction, not by a special case here).
  if (asap && baseline) {
    // The exclusion set is Bring a Trailer itself, not conditional on who currently leads (matches
    // v2Composition: it always searches for the best non-BaT evidence-backed route under rush).
    const speedExcl = runLadder(byPlatform, vehicle, generation, new Set([...byPlatform.keys()].filter(isBaTSlug)));
    if (speedExcl && (byPlatform.get(speedExcl.platform) || []).length >= SPEED_EVIDENCE_FLOOR && speedExcl.platform !== baseline.platform) {
      result = { platform: speedExcl.platform, reasonCode: "speed", figures: { ...speedExcl.figures, basedOn: speedExcl.reasonCode } };
    }
  }

  if (!result) return { mode: "online", platform: null, platformDisplay: null, reasonCode: null, figures: {}, evidenceSales: 0, thin, byPlatform: byPlatformOut, pool: { windowDays, windowLabel, thin }, houseComparison: null };
  return {
    mode: "online", platform: result.platform, platformDisplay: houseName(result.platform) || result.platform,
    reasonCode: result.reasonCode, figures: result.figures,
    // Item 1: evidenceSales + thin at the top level (not just buried in branch-specific figures) so
    // the page copy can say plainly a pick rests on very few sales whenever thin is true, regardless
    // of which branch (premium/specialist/depth) actually won.
    evidenceSales: (byPlatformOut[result.platform] && byPlatformOut[result.platform].evidenceSales) || 0, thin,
    byPlatform: byPlatformOut,
    pool: { windowDays, windowLabel, thin, trimName: spec.trim || null, generationCode: (generation && generation.code) || null },
    houseComparison: null
  };
}
