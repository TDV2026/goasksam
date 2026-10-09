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
// fallback). After the Oct 2026 40-car audit, THREE gates were ported because their absence flipped
// real picks: the symmetric premium gate (>=10%, 5v5), the asymmetric market-dominance gate (75%+
// share, 10+ combined sample), and the volume-aware sample/margin check on Branch 1 (a non-depth-
// leader's premium only leads if its sample is comparable to the leader's, or it beats the leader's
// own premium by 8+ points). NOT ported: the thin-window price-signal override, or the curated win-
// condition table - real mechanisms in the old ladder, not yet shown to change a common-car pick in
// the audit. Thresholds (10% symmetric gap at 5v5; 75% asymmetric share at 10+ combined; sample >=
// half the leader's or +8pt margin; specialist lift>=3x at 5+ scope comps; most sold comps at the
// landed scope) are unchanged from the real code.
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
export async function fetchOnlinePool(vehicle, generation, env) {
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

// Branch 1: the highest CLEARED symmetric premium (>=10%, 5v5) leads - but VOLUME-AWARE (item 5,
// audit-driven port): a platform that is NOT the depth leader may lead only when its premium rests
// on a sample comparable to the leader's (platformSales >= half the leader's evidence, floor 5) OR
// it beats the leader's OWN cleared premium by 8+ points. Without this, the highest raw percentage
// won outright - audit case: 1965 Ford Mustang, All Collector Cars' premium (on a small sample)
// outranked Bring a Trailer's deep, high-volume premium purely on a few points' edge. Mirrors
// pickRecommendedRoute's Branch 1 exactly (api/sellerDecision.js).
function clearedPctFor(byPlatform, platforms, p) {
  const mine = byPlatform.get(p);
  const others = platforms.filter(q => q !== p).flatMap(q => byPlatform.get(q));
  if (mine.length < PREMIUM_MIN_SAMPLE || others.length < PREMIUM_MIN_SAMPLE) return null;
  const mMine = median(mine), mOthers = median(others);
  if (!(mOthers > 0)) return null;
  const gap = Math.round((mMine - mOthers) / mOthers * 100);
  return gap >= PREMIUM_GAP_PCT ? { percent: gap, platformSales: mine.length, othersSales: others.length } : null;
}
function premiumPick(byPlatform, exclude, depth) {
  const platforms = [...byPlatform.keys()].filter(p => !exclude.has(p));
  const deepPlatform = depth ? depth.platform : null;
  const deepN = depth ? depth.evidenceSales : -1;
  const deepCleared = deepPlatform ? clearedPctFor(byPlatform, platforms, deepPlatform) : null;
  const deepPct = deepCleared ? deepCleared.percent : -1;
  const cleared = platforms.map(p => ({ p, c: clearedPctFor(byPlatform, platforms, p) })).filter(x => x.c).sort((a, b) => b.c.percent - a.c.percent);
  for (const { p, c } of cleared) {
    const sampleOK = c.platformSales >= Math.max(PREMIUM_MIN_SAMPLE, deepN * 0.5);
    const marginOK = deepPct >= PREMIUM_GAP_PCT && c.percent >= deepPct + 8;
    if (p === deepPlatform || sampleOK || marginOK) return { platform: p, percent: c.percent, platformSales: c.platformSales, othersSales: c.othersSales };
  }
  return null;
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
  // Depth is computed FIRST (matches the real code - pickRecommendedRoute computes `deep` before
  // Branch 1 so the volume-aware premium gate can reference it).
  const depth = depthPick(byPlatform, exclude);
  const premium = premiumPick(byPlatform, exclude, depth);
  if (premium) return { platform: premium.platform, reasonCode: "premium", figures: { percent: premium.percent, platformSales: premium.platformSales, othersSales: premium.othersSales } };
  const dominance = dominancePick(byPlatform, exclude);
  if (dominance) return { platform: dominance.platform, reasonCode: "premium", figures: { type: "market_dominance", marketShare: dominance.marketShare, platformSales: dominance.platformSales, othersSales: dominance.othersSales } };
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

// ================================================================================================
// FULL ENGINE CUTOVER (Oct 2026, SELL_PICK_SHARED round). Everything above answers ONE question
// (which platform). This answers decide()'s FULL question: feed sellerDecision.js's own decide()
// (api/sellerDecision.js) an `analysis` object SHAPED like analyze()'s return value (same field
// names decide()/analyzeRouteFit()/ladderConfidence()/wideningFact()/pickRecommendedRoute() already
// read), but built entirely from THIS file's shared archive pool instead of the capped live
// fetchRecentRecords fetch. decide() itself is NOT duplicated or reimplemented - it is the SAME
// function, unchanged, just handed different input. Every route-policy/region/evidenceCapable gate,
// win-condition table, thin-window-price override and specialist/depth/premium branch inside
// decide() therefore behaves identically; only the NUMBERS feeding it change source.
//
// Fields NOT computed here (left out, never guessed - see docs/lane-notes.md / the round's report):
//   sellerActivity (null) - "active sellers on this platform" needs seller_username activity, not
//     present in the archive pool; sellerActivityExplanation(null, ...) already degrades gracefully.
//   transmissionSplit (null) - display-only telemetry field, not read by decide()'s own logic.
//   segmentVolume, recent30 (null on every platform entry) - internal-only in the old analyze(); the
//     old code never renders segmentVolume (used only for sellerActivity-style narration elsewhere)
//     and recent30 was already computation-only, never rendered, in the original function.
//   averageBids (null) - the archive pool carries no bid-count column.
// Everything else below is a REAL computation over the shared pool, not an approximation dressed up
// as one; where a computation mirrors analyze()'s old logic it uses the SAME thresholds (5v5 sample,
// 10% gap, 15-sample/3-sale/10%-lift weekday gate, 5-per-band mileage match), just over fewer windows
// (this file's single window, not the old multi-window walk - the same scoped-simplification already
// documented above for the platform pick itself).
const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = iso => { const d = new Date(String(iso || "").slice(0, 10) + "T12:00:00Z"); return isNaN(d) ? null : weekdayNames[d.getUTCDay()]; };
const daysAgoOf = (iso, now) => (now - Date.parse(String(iso || "").slice(0, 10) + "T12:00:00Z")) / 864e5;
const milesOf = r => { const m = Number(String(r.mileage == null ? "" : r.mileage).replace(/[^\d]/g, "")); return Number.isFinite(m) && m > 0 ? m : null; };
const WEEKDAY_MIN_SAMPLE = 15, WEEKDAY_MIN_LIFT = 10, WEEKDAY_MIN_DAY_SALES = 3, WEEKDAY_WINDOW_DAYS = 365;
const MOMENTUM_WINDOW_DAYS = 30, MOMENTUM_MIN_SAMPLE = 3;
const MATCHED_WINDOW_DAYS = 730, MATCHED_BANDS = [[0, 30000], [30000, 60000], [60000, 100000], [100000, 150000], [150000, Infinity]], MATCHED_BAND_MIN = 5;

function dayAdvantageFor(rows, now) {
  const weekdayRows = rows.filter(r => daysAgoOf(r.auction_end_date, now) <= WEEKDAY_WINDOW_DAYS)
    .filter(r => { const d = weekdayOf(r.auction_end_date); return d && d !== "Saturday" && d !== "Sunday"; });
  if (weekdayRows.length < WEEKDAY_MIN_SAMPLE) return null;
  const byDay = new Map();
  for (const r of weekdayRows) { const d = weekdayOf(r.auction_end_date); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(r._usd); }
  let best = null, bestMed = -1;
  for (const [day, prices] of byDay) { if (prices.length < WEEKDAY_MIN_DAY_SALES) continue; const m = median(prices); if (m > bestMed) { bestMed = m; best = { day, prices }; } }
  if (!best) return null;
  const rest = weekdayRows.filter(r => weekdayOf(r.auction_end_date) !== best.day).map(r => r._usd);
  if (!rest.length) return null;
  const restMed = median(rest);
  const liftPercent = restMed > 0 ? Math.round((bestMed - restMed) / restMed * 100) : 0;
  if (liftPercent < WEEKDAY_MIN_LIFT) return null;
  return { weekday: best.day, sales: best.prices.length, liftPercent, scope: "model", window: WEEKDAY_WINDOW_DAYS, sample: weekdayRows.length };
}
function momentumFor(rows, now) {
  const recent = rows.filter(r => daysAgoOf(r.auction_end_date, now) <= MOMENTUM_WINDOW_DAYS).map(r => r._usd);
  const prior = rows.filter(r => { const a = daysAgoOf(r.auction_end_date, now); return a > MOMENTUM_WINDOW_DAYS && a <= MOMENTUM_WINDOW_DAYS * 2; }).map(r => r._usd);
  if (recent.length < MOMENTUM_MIN_SAMPLE || prior.length < MOMENTUM_MIN_SAMPLE) return null;
  const pm = median(prior); if (!(pm > 0)) return null;
  return { percent: Math.round((median(recent) - pm) / pm * 100), recentSales: recent.length, priorSales: prior.length, windowDays: MOMENTUM_WINDOW_DAYS };
}
function matchedPremiumFor(slug, rows, byRows, platforms) {
  const recency = rows.reduce((mx, r) => { const d = String(r.auction_end_date || "").slice(0, 10); return d > mx ? d : mx; }, "");
  let wSum = 0, wDelta = 0, usedMine = 0, usedOthers = 0, bandsUsed = 0;
  for (const [lo, hi] of MATCHED_BANDS) {
    const inBand = r => { const mi = milesOf(r); return mi != null && mi >= lo && mi < hi; };
    const mine = rows.filter(inBand).map(r => r._usd);
    const others = platforms.filter(p => p !== slug).flatMap(p => byRows.get(p)).filter(inBand).map(r => r._usd);
    if (mine.length >= MATCHED_BAND_MIN && others.length >= MATCHED_BAND_MIN && median(others) > 0) {
      const d = (median(mine) - median(others)) / median(others), w = mine.length + others.length;
      wSum += w; wDelta += d * w; usedMine += mine.length; usedOthers += others.length; bandsUsed++;
    }
  }
  if (wSum > 0) return { ok: true, matched: true, percent: Math.round((wDelta / wSum) * 100), platformSales: usedMine, othersSales: usedOthers, sales: usedMine + usedOthers, bandsUsed, windowDays: MATCHED_WINDOW_DAYS };
  return { tooThin: true, matched: true, platformSales: rows.length, recencyDate: recency || null, windowDays: MATCHED_WINDOW_DAYS };
}
// pricePremium for EVERY platform (not just the eventual winner) - same gates pickPlatform's own
// premiumPick/dominancePick apply, generalized so analyzeRouteFit's scoring (which reads every
// platform's pricePremium, not only the pick's) sees the same signal decide() always expected.
function pricePremiumAllFor(slug, byRows, platforms) {
  const mine = (byRows.get(slug) || []).map(r => r._usd);
  const others = platforms.filter(p => p !== slug).flatMap(p => byRows.get(p)).map(r => r._usd);
  if (mine.length >= PREMIUM_MIN_SAMPLE && others.length >= PREMIUM_MIN_SAMPLE) {
    const mOthers = median(others);
    if (mOthers > 0) return { gateType: "symmetric", percent: Math.round((median(mine) - mOthers) / mOthers * 100), platformSales: mine.length, othersSales: others.length };
  }
  const total = mine.length + others.length;
  if (mine.length >= PREMIUM_MIN_SAMPLE && others.length < PREMIUM_MIN_SAMPLE && total >= 10) {
    const share = Math.round((mine.length / total) * 100);
    if (share >= 75) return { gateType: "asymmetric", percent: null, marketShare: share, platformSales: mine.length, othersSales: others.length };
  }
  return null;
}

// buildSharedAnalysis(vehicle, generation, env, criteria) -> an `analysis` object decide() can
// consume directly, or null when the shared pool has nothing (caller falls back to the capped fetch
// so a seller is never dead-ended). Online-only (house mode is handled entirely by the existing,
// separate house-comparison path in api/sellerDecision.js, untouched - see item 4 of this round).
export async function buildSharedAnalysis(vehicle, generation, env, criteria = {}) {
  const now = Date.now();
  const { spec, pool, windowDays, windowLabel, thin } = await fetchOnlinePool(vehicle, generation, env);
  if (!spec || !pool.length) return null;
  const byRows = new Map();
  for (const r of pool) {
    const slug = sourceSlugOf(r.source) || norm(r.source);
    const price = hammerUsd(r);
    if (!slug || !Number.isFinite(price) || price <= 0) continue;
    r._usd = price;
    if (!byRows.has(slug)) byRows.set(slug, []);
    byRows.get(slug).push(r);
  }
  const platforms = [...byRows.keys()];
  if (!platforms.length) return null;
  const allRows = platforms.flatMap(p => byRows.get(p));
  const totalEvidenceSales = allRows.length;
  const estimatedValue = median(allRows.map(r => r._usd));

  let platformPerformance = platforms.map(slug => {
    const rows = byRows.get(slug);
    const prices = rows.map(r => r._usd);
    const others = platforms.filter(p => p !== slug).flatMap(p => byRows.get(p));
    const othersPrices = others.map(r => r._usd);
    const sortedPrices = prices.slice().sort((a, b) => a - b);
    const qband = f => sortedPrices.length < 2 ? null : sortedPrices[Math.max(0, Math.min(sortedPrices.length - 1, Math.round(f * (sortedPrices.length - 1))))];
    return {
      // api/sellerDecision.js's platformPolicyKey() maps this string back to a ROUTE_POLICIES key by
      // lowercasing and stripping every non-alnum char, then substring-matching "carsandbids" /
      // "carandclassic" - an ampersand display name ("Cars & Bids", "Car & Classic") strips to
      // "carsbids"/"carclassic" and never matches, silently losing that platform's route policy.
      // "and" survives the strip and still reads fine in a sentence ("Cars and Bids is the...").
      platform: (houseName(slug) || slug).replace(/&/g, "and"), policyKeySlug: slug,
      evidenceSales: rows.length, closeSales: rows.length, relevantSales: 0, broadSales: 0,
      modelSales: rows.length,
      modelComps180: rows.filter(r => daysAgoOf(r.auction_end_date, now) <= 180).length,
      totalEvidenceSales, othersSalesCount: others.length, othersMedianSalePrice: median(othersPrices),
      evidenceSharePercent: totalEvidenceSales ? Math.round(rows.length / totalEvidenceSales * 100) : null,
      medianSalePrice: median(prices),
      pricePremium: pricePremiumAllFor(slug, byRows, platforms),
      matchedPremium: matchedPremiumFor(slug, rows, byRows, platforms),
      momentum: momentumFor(rows, now),
      dayAdvantage: dayAdvantageFor(rows, now),
      segmentVolume: null, recent30: null,
      priceBand: sortedPrices.length >= 2 ? { low: qband(0.25), high: qband(0.75), sample: sortedPrices.length } : null,
      trimSales: spec.trim ? rows.length : 0,
      topThreeSales: rows.slice().sort((a, b) => b._usd - a._usd).slice(0, 3).length,
      averageBids: null,
      highestResultWeekday: weekdayOf(rows.slice().sort((a, b) => b._usd - a._usd)[0]?.auction_end_date),
      latestSaleDate: rows.map(r => r.auction_end_date).filter(Boolean).sort().at(-1) || null,
      nextSupportedPlatform: null, performanceDeltaPercent: null
    };
  }).sort((a, b) => b.evidenceSales - a.evidenceSales || b.closeSales - a.closeSales || (b.medianSalePrice || 0) - (a.medianSalePrice || 0));
  platformPerformance = platformPerformance.map(p => {
    const nextBest = platformPerformance.filter(o => o.platform !== p.platform && o.medianSalePrice).sort((a, b) => (b.medianSalePrice || 0) - (a.medianSalePrice || 0))[0];
    const delta = p.medianSalePrice && nextBest?.medianSalePrice ? Math.round((p.medianSalePrice - nextBest.medianSalePrice) / nextBest.medianSalePrice * 100) : null;
    return { ...p, nextSupportedPlatform: nextBest?.platform || null, performanceDeltaPercent: delta };
  });

  // Ladder "landed" shape: a defensible mapping from this file's single-window pick, not a fabricated
  // multi-rung walk. trim+generation-bound and not thinned -> the trim-scoped tiers (ladderConfidence
  // reads "high" at 5+ sales); no trim or thinned-to-all-time -> the model/any-year tiers (medium/low).
  // rung is always 1 (one real window was read, not a multi-step widen), so wideningFact(analysis)
  // honestly returns null rather than narrating a widen that did not happen.
  const key = spec.trim ? (thin ? "any_year_trim" : "generation_trim") : (thin ? "any_year_model" : "generation_model");
  const landed = {
    rung: 1, key, label: `${spec.trim ? spec.trim + " " : ""}${vehicle.model || ""} sales, ${windowLabel || "the shared archive"}`.trim(),
    generationCode: (generation && generation.code) || null, windowDays, sales: totalEvidenceSales,
    effectiveSample: totalEvidenceSales, threshold: ONLINE_MIN, thresholdMet: totalEvidenceSales >= ONLINE_MIN
  };
  return {
    analysisDate: new Date(now).toISOString(), windowDays, evidenceLabel: windowLabel || "the shared archive",
    recordsFetched: totalEvidenceSales, recordsAnalyzed: totalEvidenceSales,
    evidenceSales: totalEvidenceSales, estimatedValue, thinMarket: thin,
    ladder: { landed, rungs: [landed], policyFloorRung: 2 },
    platformPerformance, sellerActivity: null, historicalWeekday: null, transmissionSplit: null,
    sourcedFromSharedPool: true
  };
}
