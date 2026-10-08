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
// for the full note to Lane C): this reads ONE window (Market Check's, 730 days widened to 1825 if
// thin), not sellerDecision.js's multi-window, multi-scope walk (45/90/180/.../segment fallback);
// it implements only the SYMMETRIC premium gate (>=10%, 5v5) the task asked for, not the asymmetric
// market-dominance gate, the volume-aware sample/margin refinement on Branch 1, the thin-window
// price-signal override, or the curated win-condition table - those are real mechanisms in the old
// ladder this does NOT port. The three thresholds requested (10% symmetric gap at 5v5 samples;
// specialist lift>=3x at 5+ scope comps; most sold comps at the landed scope) are unchanged from
// the real code.
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
  if (!spec || !spec.make) return { spec: null, pool: [], windowDays: null, windowLabel: null };
  // Trim-title scope (same pattern priceBandForVehicle/listSalesForVehicle use, lib/onebox.js):
  // buildSpec does not set titleContains itself for a plain (non-performance-badge) named trim, so
  // without this a "Carrera S" or "Fastback" query would read the whole model, not the named trim.
  const trimTok = vehicle.trim && String(vehicle.trim).trim() ? String(vehicle.trim).trim() : "";
  if (trimTok && !spec.titleContains && !spec.perfInclude && !spec.badge) spec.titleContains = trimTok;
  const fetchAt = async days => {
    const sinceIso = new Date(Date.now() - days * 864e5).toISOString();
    const rows = await fetchQualifying(spec, sinceIso, env, {}).catch(() => []);
    return (rows || []).filter(r => !isHouseSource(r.source));
  };
  let pool = await fetchAt(730), windowDays = 730, windowLabel = "the past 2 years";
  if (pool.length < ONLINE_MIN) {
    const wide = await fetchAt(1825);
    if (wide.length > pool.length) { pool = wide; windowDays = 1825; windowLabel = "the past 5 years"; }
  }
  return { spec, pool, windowDays, windowLabel };
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
// "measured" per pickRecommendedRoute: some platform has 5+ of its own AND 5+ others to compare
// against. Specialist only ever stands in when NOTHING is measured network-wide.
function anyMeasured(byPlatform, exclude) {
  const platforms = [...byPlatform.keys()].filter(p => !exclude.has(p));
  return platforms.some(p => byPlatform.get(p).length >= PREMIUM_MIN_SAMPLE
    && platforms.filter(q => q !== p).reduce((n, q) => n + byPlatform.get(q).length, 0) >= PREMIUM_MIN_SAMPLE);
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
//   byPlatform: { slug: { evidenceSales, medianHammer } } - every platform's own figures, for the card
//   pool: { windowDays, windowLabel } - what window the online pick was read from
//   houseComparison: buildHouseComparison() output, present whenever the house branch ran
export async function pickPlatform(vehicle, generation, env, criteria = {}) {
  const asap = wantsSpeed(criteria.timeline);

  // Item 2: an auction house is ONLY ever picked when the seller explicitly chose "through an
  // auction house" (rules 10 and 22e) - never on sales count alone. One shared 36-month house
  // receipts window for both pages (see the note below).
  if (wantsHouse(criteria)) {
    const hr = await houseReceiptsForVehicle(vehicle, generation, env).catch(() => null);
    const hc = buildHouseComparison((hr && hr.houseReceipts) || [], { todayISO: new Date().toISOString().slice(0, 10), asap });
    if (!hc || !hc.houses.length) return { mode: "house", platform: null, platformDisplay: null, reasonCode: "house", figures: { houseWindowDays: HOUSE_WINDOW_DAYS, totalHouse: 0 }, byPlatform: {}, pool: null, houseComparison: hc };
    const lead = (asap && hc.asapLead && hc.houses.find(h => h.slug === hc.asapLead)) || hc.houses[0];
    return {
      mode: "house", platform: lead.slug, platformDisplay: lead.display,
      reasonCode: asap && lead.slug === hc.asapLead && hc.houses[0].slug !== lead.slug ? "speed" : "house",
      figures: { count: lead.count, totalHouse: hc.totalHouse, houseWindowDays: HOUSE_WINDOW_DAYS, nextSale: lead.nextSale || null },
      byPlatform: Object.fromEntries(hc.houses.map(h => [h.slug, { evidenceSales: h.count, medianHammer: h.median }])),
      pool: null, houseComparison: hc
    };
  }

  const { spec, pool, windowDays, windowLabel } = await fetchOnlinePool(vehicle, generation, env);
  if (!spec) return { mode: "online", platform: null, platformDisplay: null, reasonCode: null, figures: {}, byPlatform: {}, pool: { windowDays: null, windowLabel: null }, houseComparison: null };
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

  if (!result) return { mode: "online", platform: null, platformDisplay: null, reasonCode: null, figures: {}, byPlatform: byPlatformOut, pool: { windowDays, windowLabel }, houseComparison: null };
  return {
    mode: "online", platform: result.platform, platformDisplay: houseName(result.platform) || result.platform,
    reasonCode: result.reasonCode, figures: result.figures, byPlatform: byPlatformOut,
    pool: { windowDays, windowLabel, trimName: spec.trim || null, generationCode: (generation && generation.code) || null },
    houseComparison: null
  };
}
