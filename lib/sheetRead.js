// SHEET READ (Lane B, Nov 2026, Desk Valuations spec item 2). ONE engine call: a VIN, or a year, make and model, plus a mileage (and a tier when the expert clicked one), returns sections 1 to 4 of the
// valuation sheet as ONE serialisable object (the shape in lib/desk/sheetShape.js). The page and the PDF compute nothing: every figure here is a field of the same oneEngineAnswer the consumer
// pages read (the same pool, price fence, thin rule and set asides), plus the engine's own tier fields (refine.conditionTier, lib/onebox.js withConditionTier).
//   1 car       as resolved: the VIN decode or the typed words, the mileage (submitted, asked, or the engine's ask for it), gearbox and colour from the exact car's own record
//   2 exact     this exact car's record: every appearance the archive holds for the VIN (sold, with price and venue), or the engine's line that there is none
//   3 market    the market read with its window, count, range (the engine's own), median and quartiles of the same pool, the splits (the engine's options), live listings, newest sale
//   4 condition the tier counts over the same pool, the selected tier, the same tier pool and the starting figure (median of the pool after tier and mileage band; null under five)
//   frozen read: version, readAt, the engine stamp and the sales epoch, so a finalised sheet can say which read it froze.
// VIN path = the Market Check VIN path (lib/vinAsTyped.js): the VIN names the car, the typed path reads it, then the car's own facts go on top. Dependencies are injectable so the check runs offline.
import { oneEngineAnswer, withReadFields, ENGINE_VERSION, TIER_FIELDS } from "./onebox.js";
import { TIER_NAMES, TIER_VERSION } from "./conditionTier.js";
import { supabaseSelect } from "./_supabase.js";
import { isFailedRead } from "./tools/_shared.js";
import { reasonLine } from "./reasonWords.js";

export const SHEET_READ_VERSION = 1;
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const quant = (sorted, p) => { if (!sorted.length) return null; const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)); };
const priceOf = r => Number(r._usd ?? r._allin ?? r._hammer);
const iso = d => (d ? String(d).slice(0, 10) : null);

// THE CAR'S OWN TIER EVIDENCE (Lane D, Nov 2026): when the VIN has a sale in the archive, that sale's stored tier and the lines the tier job counted (condition_evidence, in its own words), read only at the CURRENT
// tier version. Read, never scored here. null when the sale has no tier of the current rules.
async function carTierOf(env, saleId) {
  if (!saleId) return null;
  const got = await supabaseSelect(env, `sales_archive?id=eq.${encodeURIComponent(saleId)}&select=id,condition_tier,condition_evidence,condition_version&limit=1`).catch(() => null);
  const g = Array.isArray(got) ? got[0] : null;
  if (!g || g.condition_version !== TIER_VERSION || !Array.isArray(g.condition_evidence)) return null;
  return { tier: g.condition_tier == null ? null : Number(g.condition_tier), evidence: g.condition_evidence.map(e => ({ code: String(e.code || ""), points: Number(e.points) || 0, line: String(e.line || "") })).filter(e => e.line) };
}
// Which half of the cards' own price order a card sits in: the middle card of an odd pool is in neither, a tie across the middle is in neither. Ranks only; no figure.
export function halfFinder(cards, enabled = true) {
  const pr = c => num(c && (c.price ?? c._usd)), ps = (cards || []).map(pr).filter(n => n != null).sort((x, y) => x - y), n = ps.length;
  return c => { const p = pr(c); if (!enabled || p == null || n < 2) return null; const lo = ps[Math.floor((n - 1) / 2)], hi = ps[Math.ceil((n - 1) / 2)]; return p < lo ? "lower" : p > hi ? "upper" : null; };
}
async function defaultDeps() {
  const [veh, flags, vin, live] = await Promise.all([import("./vehicle.js"), import("./_flags.js"), import("./vinAsTyped.js"), import("./live/search.js").catch(() => ({}))]);
  return { resolveVehicle: veh.resolveVehicle, decodeVin: veh.decodeVinFacts, archiveMatch: flags.findVinArchiveMatch, vinPlan: vin.vinSearchPlan, vinOverlay: vin.applyVinOverlay, liveFor: live.liveForFamily, generationFor: null, carTier: carTierOf };
}

// input: { vin } | { year, make, model, trim?, bodyStyle? }, plus { mileage, tier }. Returns the sheetRead object, or null when the car cannot be read (never an invented read).
export async function sheetRead(env, input = {}, deps = null) {
  const d = deps || await defaultDeps();
  const tier = [1, 2, 3, 4].includes(Number(input.tier)) ? Number(input.tier) : null, askedMiles = num(String(input.mileage == null ? "" : input.mileage).replace(/[^\d.]/g, "")) || null;
  const vin = input.vin && VIN_RE.test(String(input.vin).toUpperCase().replace(/[^A-Z0-9]/g, "")) ? String(input.vin).toUpperCase().replace(/[^A-Z0-9]/g, "") : (input.vin ? String(input.vin).toUpperCase() : null);
  // 1. the car as resolved
  let vehicle = null, decode = null, archive = null, plan = null;
  if (vin) {
    archive = d.archiveMatch ? await d.archiveMatch(env, { vin }).catch(() => null) : null;
    const facts = d.decodeVin ? await d.decodeVin(vin).catch(() => null) : null;
    const fromVin = facts && facts.make && facts.model && num(facts.year) > 0 ? { year: num(facts.year), make: facts.make, model: facts.model, trim: facts.trim || null, bodyStyle: facts.bodyStyle || facts.body || null, transmission: facts.transmission || null, vin } : (archive && archive.year && archive.make && archive.model ? { year: num(archive.year), make: archive.make, model: archive.model, trim: archive.trim || null, bodyStyle: archive.bodyStyle || null, vin } : null);
    if (!fromVin) return null;
    plan = d.vinPlan ? await d.vinPlan(fromVin, { resolveVehicle: d.resolveVehicle, archive, live: null }).catch(() => null) : { vehicle: fromVin, text: [fromVin.year, fromVin.make, fromVin.model].join(" "), ctx: null };
    if (!plan || plan.unresolved || !plan.vehicle) return null;
    vehicle = plan.vehicle; decode = { year: fromVin.year, make: fromVin.make, model: fromVin.model, trim: fromVin.trim, body: fromVin.bodyStyle, source: "vin" };
  } else {
    const year = num(input.year), make = String(input.make || "").trim(), model = String(input.model || "").trim();
    if (!(year > 0 && make && model)) return null;
    const text = [year, make, model, input.trim].filter(Boolean).join(" ");
    const r = d.resolveVehicle ? await d.resolveVehicle(text, {}).catch(() => null) : null;
    vehicle = r && r.status === "valid" && r.vehicle ? r.vehicle : (d.resolveVehicle ? null : { year, make, model, trim: input.trim || null, bodyStyle: input.bodyStyle || null });
    if (!vehicle) return null;
    decode = { year: num(vehicle.year) || year, make: vehicle.make || make, model: vehicle.model || model, trim: vehicle.trim || null, body: vehicle.bodyStyle || null, source: "typed" };
  }
  const text = (plan && plan.text) || [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  // 3 + 4. the SAME answer a typed search reads; with a tier, the engine's own tier fields on it. The mileage rides as the band the tier pool is cut by (the base answer is the untiered one).
  const refine = { conditionTier: tier || 0, ...(tier && askedMiles ? { miTarget: askedMiles } : {}) };
  const res = await oneEngineAnswer(vehicle, null, text, env, refine);
  let a = res && res.raw;
  // A READ THAT DID NOT FINISH IS "TRY AGAIN", NEVER "THE CAR CANNOT BE READ" (Lane B, Nov 2026, lane-b-retry): the engine's still-reading answer (unavailable, never stored) goes to the sheet as retry, with its line; null stays for a car that cannot be resolved or has no read.
  if (isFailedRead(a)) return { version: SHEET_READ_VERSION, retry: true, retryAfterMs: Number(a && a.retryAfterMs) > 0 ? Number(a.retryAfterMs) : 15000, line: reasonLine("cold.still"), engineVersion: ENGINE_VERSION };
  if (/^(refusal)$/.test(String(a.tier || "")) && !a.rawPool) return null;
  if (plan && plan.ctx && d.vinOverlay) a = d.vinOverlay(a, plan.ctx);
  a = withReadFields(a, text, vehicle);
  const pool = (Array.isArray(a.rawPool) ? a.rawPool : []).filter(r => priceOf(r) > 0), prices = pool.map(priceOf).sort((x, y) => x - y);
  const isResult = a.tier === "result";
  const live = d.liveFor ? await d.liveFor(env, vehicle, null, {}, 6, Array.isArray(a.cluster) ? { low: a.cluster[0], high: a.cluster[1] } : null).catch(() => null) : null;
  // 2. this exact car
  const appearances = archive && archive.soldDate ? [{ date: iso(archive.soldDate), venue: archive.source || null, outcome: "sold", price: num(archive.price), highBid: null, url: archive.url || null }] : [];
  const prior = archive ? { colour: archive.colour || null, gearbox: archive.transmission || null, mileage: num(archive.mileage), lastSaleDate: iso(archive.soldDate) } : null;
  const cardsOf = tier && Array.isArray(a.tierComparables) ? a.tierComparables : (Array.isArray(a.cards) ? a.cards : []);
  const tierOk = tier && a.tierPoolState === "ok";
  const saleId = archive && Array.isArray(archive.sales) && archive.sales[0] ? archive.sales[0].id : null;
  const carTier = d.carTier && saleId ? await d.carTier(env, saleId).catch(() => null) : null;
  // The halves of the SAME tier pool the engine returned (by price, the middle sale of an odd pool in neither): the analyst's plus or minus hint. Ranks only, no new figure.
  const halfOf = halfFinder(cardsOf, tierOk);
  const splits = []; for (const o of Array.isArray(a.options) ? a.options : []) { let g = splits.find(s => s.dimension === o.dimension); if (!g) splits.push(g = { dimension: o.dimension, options: [] }); g.options.push({ label: o.label, count: num(o.n), low: num(o.low), high: num(o.high), median: num(o.median) }); }
  const out = {
    version: SHEET_READ_VERSION, readAt: new Date().toISOString(), frozen: false, engineVersion: ENGINE_VERSION, salesEpoch: a.salesEpoch || a.warmEpoch || null,
    car: { vin: vin || null, label: [decode.year, decode.make, decode.model, decode.trim].filter(Boolean).join(" "), decode, mileage: askedMiles ? { value: askedMiles, source: input.mileageSource || "asked", ask: null } : { value: null, source: null, ask: "Mileage was not in the submission. Enter it to read the market around it." }, gearbox: (archive && archive.transmission) || vehicle.transmission || null, colour: (archive && archive.colour) || null, prior },
    exact: { appearances, none: appearances.length ? null : "No prior auction record for this VIN." },
    market: {
      window: { months: num(a.windowMonths), stated: a.windowWords || null, fallback: !!a.windowLonger },
      tier: a.tier, count: num(a.poolN) ?? num(a.qualifyingTotal), low: isResult && Array.isArray(a.cluster) ? a.cluster[0] : null, high: isResult && Array.isArray(a.cluster) ? a.cluster[1] : null,
      median: isResult ? quant(prices, 0.5) : null, p25: isResult ? quant(prices, 0.25) : null, p75: isResult ? quant(prices, 0.75) : null, newest: iso(a.latestSaleDate),
      thinLine: a.thinLine || null, basisLine: a.basisLine || null, splits,
      live: ((live && live.rows) || []).map(r => ({ venue: r.platform || r.source || null, bid: num(r.current_bid_usd), endsAt: r.end_time || null, title: r.listing_title || r.title || null, url: r.listing_url || r.url || null })), liveTotal: live ? num(live.total) : null,
      startingFigure: tierOk ? a.startingFigure : null,
      startingNote: !tier ? "Pick a condition tier for a starting figure." : a.tierPoolState === "ok" ? "The median of the sales in this condition and mileage band." : a.tierPoolState === "too_few" ? a.tierPoolLine : a.tierPoolState === "no_tier_data" ? "Condition tiers are not assigned to these sales yet." : "The condition tier could not be read just now.",
      comparables: cardsOf.slice(0, 12).map(c => ({ date: iso(c.date || c.soldDate || c.auction_end_date), venue: c.platform || c.source || c.house || null, price: num(c.price ?? c._usd), mileage: num(c.mileage ?? c.miles), tier: tier ? tier : null, half: halfOf(c), url: c.url || c.srcurl || null, title: c.title || c.name || c.raw_title || null })),
      wider: tier && a.tierPoolState === "too_few" && isResult ? { low: a.cluster[0], high: a.cluster[1], count: num(a.poolN) } : null
    },
    condition: tier || a.tierPoolState === "counts" ? { tiers: [1, 2, 3, 4].map(t => ({ tier: t, label: TIER_NAMES[t], count: a.tierCounts ? a.tierCounts[t] : null })), untiered: a.tierUntieredN ?? null, selected: tier || null, sameTierCount: a.tierPoolN ?? null, bandCount: a.tierBandN ?? null, state: a.tierPoolState === "counts" ? "not_asked" : a.tierPoolState, tooFew: a.tierPoolState === "too_few", tooFewLine: a.tierPoolState === "too_few" ? a.tierPoolLine : null }
      : { tiers: [1, 2, 3, 4].map(t => ({ tier: t, label: TIER_NAMES[t], count: null })), untiered: null, selected: null, sameTierCount: null, bandCount: null, state: "not_asked", tooFew: false, tooFewLine: null },
    coverage: { footer: a.footer || a.coverageLine || "Sold results from the venues the record holds. Private sales and condition are not in the record.", methodology: "Hammer prices with premiums backed out, the same pool, price fence and set asides as the consumer pages, tier from each sale's own listing text." }
  };
  // The signals the engine counted for this car's own record (its words), or the engine's plain line that there are none. Never scored here.
  out.condition.carEvidence = carTier && carTier.evidence.length ? { tier: carTier.tier, lines: carTier.evidence, source: "this car's last sale listing" } : null;
  out.condition.carEvidenceNote = out.condition.carEvidence ? null : "The engine holds no listing signals for this car, so it counted none.";
  return JSON.parse(JSON.stringify(out));
}
export { TIER_FIELDS };
