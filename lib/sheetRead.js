// SHEET READ (Lane B, Nov 2026, Desk Valuations spec item 2). ONE engine call: a VIN, or a year, make and model, plus a mileage (and a tier when the expert clicked one), returns sections 1 to 4 of the
// valuation sheet as ONE serialisable object (the shape in lib/desk/sheetShape.js). The page and the PDF compute nothing: every figure here is a field of the same oneEngineAnswer the consumer
// pages read (the same pool, price fence, thin rule and set asides), plus the engine's own tier fields (refine.conditionTier, lib/onebox.js withConditionTier).
//   1 car       as resolved: the VIN decode or the typed words, the mileage (submitted, asked, or the engine's ask for it), gearbox and colour from the exact car's own record
//   2 exact     this exact car's record: every appearance the archive holds for the VIN (sold, with price and venue), or the engine's line that there is none
//   3 market    the market read with its window, count, range (the engine's own), median and quartiles of the same pool, the splits (the engine's options), live listings, newest sale
//   4 condition the tier counts over the same pool, the selected tier, the same tier pool and the starting figure (median of the pool after tier and mileage band; null under five)
//   frozen read: version, readAt, the engine stamp and the sales epoch, so a finalised sheet can say which read it froze.
// VIN path = the Market Check VIN path (lib/vinAsTyped.js): the VIN names the car, the typed path reads it, then the car's own facts go on top. Dependencies are injectable so the check runs offline.
import { oneEngineAnswer, withReadFields, ENGINE_VERSION, TIER_FIELDS, obBodyFamily } from "./onebox.js";
import { TIER_NAMES, TIER_VERSION, NO_LISTING_LINE } from "./conditionTier.js";
import { supabaseSelect } from "./_supabase.js";
// the car's label is the inbound email path's naming (lib/desk/intake/carName.js), so a typed sheet and an emailed one read the same
import { carLabel } from "./desk/intake/carName.js";
import { isFailedRead } from "./tools/_shared.js";
import { reasonLine } from "./reasonWords.js";
import { countNoun } from "./countNoun.js";

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
// The sale(s) the starting figure is the median of, marked in the pool the engine returned: the middle sale of an odd pool is "median"; an even pool has two "middle" sales (the figure sits between them). Ranks only.
export function middleFinder(cards, enabled = true) {
  const pr = c => num(c && (c.price ?? c._usd)), ps = (cards || []).map(pr).filter(n => n != null).sort((x, y) => x - y), n = ps.length;
  return c => { const p = pr(c); if (!enabled || p == null || n < 1) return null; const lo = ps[Math.floor((n - 1) / 2)], hi = ps[Math.ceil((n - 1) / 2)]; return p !== lo && p !== hi ? null : (lo === hi ? "median" : "middle"); };
}
export const MAX_PROOF_ROWS = 400;   // every sale of the same tier pool (a pool is a few hundred at most); a wider read shows the first twelve
export function halfFinder(cards, enabled = true) {
  const pr = c => num(c && (c.price ?? c._usd)), ps = (cards || []).map(pr).filter(n => n != null).sort((x, y) => x - y), n = ps.length;
  return c => { const p = pr(c); if (!enabled || p == null || n < 2) return null; const lo = ps[Math.floor((n - 1) / 2)], hi = ps[Math.ceil((n - 1) / 2)]; return p < lo ? "lower" : p > hi ? "upper" : null; };
}
// THE QUESTION A SPLIT POOL ASKS (Lane D, Nov 2026, demo blockers). When the engine finds the pool splits into options priced apart (body, gearbox, edition, year) it withholds the one range (optionsState apart or split,
// cluster null), and a tier median over the mixed pool would be a number for no car. The sheet then asks the expert to pick the option: the engine's own options with their counts, each carrying the refine the engine
// takes back (refine.body, tx, variant, year). Mileage is not asked: the tier's mileage band already cuts by it. The pick is read back through the same engine call, so the tier pool is the pool of that option.
const ASK_WORDS = { body: ["Which body style is it?", "body style"], gearbox: ["Which gearbox does it have?", "gearbox"], edition: ["Which edition is it?", "edition"], year: ["Which year is it?", "year"] };
export function askOfAnswer(x) {
  if (!x || !(x.optionsState === "apart" || x.optionsState === "split")) return null;
  const dim = x.headlineDimension; if (!dim || !ASK_WORDS[dim]) return null;
  const opts = (Array.isArray(x.options) ? x.options : []).filter(o => o && o.refine && o.value != null);
  if (opts.length < 2) return null;
  return { dimension: dim, prompt: ASK_WORDS[dim][0], noun: ASK_WORDS[dim][1], reason: x.thinLine || null, options: opts.map(o => ({ label: o.label, value: String(o.value), count: num(o.n), windowWords: o.windowWords || null, refine: o.refine })) };
}
const styleWord = s => { const w = String(s || "").toLowerCase(); return /cabriolet|convertible|roadster|spider|spyder|drophead/.test(w) ? "convertible" : /coup/.test(w) ? "coupe" : /targa/.test(w) ? "targa" : /sedan|saloon/.test(w) ? "sedan" : /wagon|estate/.test(w) ? "wagon" : /fastback/.test(w) ? "fastback" : null; };
const refineOfPicks = picks => picks.reduce((r, p) => ({ ...r, ...p.refine }), {});
const mi = n => Number(n).toLocaleString("en-US");
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
    // typed words ("2008 Porsche 911 Carrera S") or the parts; the year is the one four digit year in them
    const typed = input.text ? String(input.text).trim() : "", ym = typed.match(/\b(19[0-9]{2}|20[0-9]{2})\b/);
    const year = typed ? num(ym && ym[1]) : num(input.year), make = typed ? "typed" : String(input.make || "").trim(), model = typed ? "typed" : String(input.model || "").trim();
    if (!(year > 0 && make && model)) return null;
    const text = typed || [year, make, model, input.trim].filter(Boolean).join(" ");
    const r = d.resolveVehicle ? await d.resolveVehicle(text, {}).catch(() => null) : null;
    vehicle = r && r.status === "valid" && r.vehicle ? r.vehicle : (d.resolveVehicle ? null : { year, make, model, trim: input.trim || null, bodyStyle: input.bodyStyle || null });
    if (!vehicle) return null;
    decode = { year: num(vehicle.year) || year, make: vehicle.make || make, model: vehicle.model || model, trim: vehicle.trim || null, body: vehicle.bodyStyle || null, source: "typed" };
  }
  const text = (plan && plan.text) || [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  // 3 + 4. the SAME answer a typed search reads; with a tier, the engine's own tier fields on it. The mileage rides as the band the tier pool is cut by (the base answer is the untiered one).
  // picks = the options the expert chose from a split (see askOfAnswer): each is checked against the engine's own options at that step, so a stale or invented pick is dropped.
  const wanted = (Array.isArray(input.picks) ? input.picks : []).filter(p => p && ASK_WORDS[p.dimension] && p.value != null).slice(0, 4);
  const tierRefine = rf => ({ ...rf, conditionTier: tier || 0, ...(tier && askedMiles ? { miTarget: askedMiles } : {}) });
  const runChain = async picks => {
    const applied = [], asks = [];
    for (const p of picks) {
      const rf = refineOfPicks(applied), x = (await oneEngineAnswer(vehicle, null, text, env, Object.keys(rf).length ? rf : null)).raw, q = askOfAnswer(x);
      const o = q && q.dimension === p.dimension ? q.options.find(z => z.value === String(p.value)) : null;
      if (!o) break;
      applied.push({ dimension: q.dimension, value: o.value, label: o.label, refine: o.refine, fromVin: !!p.fromVin }); asks.push({ ...q, selected: o.value, fromVin: !!p.fromVin });
    }
    return { applied, asks, res: await oneEngineAnswer(vehicle, null, text, env, tierRefine(refineOfPicks(applied))) };
  };
  let chain = await runChain(wanted);
  let res = chain.res, a = res && res.raw;
  // The VIN names the body: when the pool splits by body and the VIN's decoded body is one of the engine's options, that option is preselected (the expert can pick another).
  const vinStyle = decode.source === "vin" ? styleWord(decode.body) : null, vinFamily = vinStyle ? obBodyFamily(vinStyle) : null;
  if (!isFailedRead(a) && vinFamily) {
    const q0 = askOfAnswer(a), o = q0 && q0.dimension === "body" && !chain.applied.some(p => p.dimension === "body") ? q0.options.find(z => z.value === vinFamily) : null;
    if (o) { const again = await runChain([...chain.applied.map(p => ({ dimension: p.dimension, value: p.value })), { dimension: "body", value: o.value, fromVin: true }]); if (again.res && !isFailedRead(again.res.raw)) { chain = again; res = again.res; a = res.raw; } }
  }
  // A READ THAT DID NOT FINISH IS "TRY AGAIN", NEVER "THE CAR CANNOT BE READ" (Lane B, Nov 2026, lane-b-retry): the engine's still-reading answer (unavailable, never stored) goes to the sheet as retry, with its line; null stays for a car that cannot be resolved or has no read.
  if (isFailedRead(a)) return { version: SHEET_READ_VERSION, retry: true, retryAfterMs: Number(a && a.retryAfterMs) > 0 ? Number(a.retryAfterMs) : 15000, line: reasonLine("cold.still"), engineVersion: ENGINE_VERSION };
  if (/^(refusal)$/.test(String(a.tier || "")) && !a.rawPool) return null;
  if (plan && plan.ctx && d.vinOverlay) a = d.vinOverlay(a, plan.ctx);
  a = withReadFields(a, text, vehicle);
  const pool = (Array.isArray(a.rawPool) ? a.rawPool : []).filter(r => priceOf(r) > 0), prices = pool.map(priceOf).sort((x, y) => x - y);
  const isResult = a.tier === "result", headlineOk = isResult && !a.pooledApart;   // a split pool has no one range: no median of the mix either
  const live = d.liveFor ? await d.liveFor(env, vehicle, null, {}, 6, Array.isArray(a.cluster) ? { low: a.cluster[0], high: a.cluster[1] } : null).catch(() => null) : null;
  // 2. this exact car
  const appearances = archive && archive.soldDate ? [{ date: iso(archive.soldDate), venue: archive.source || null, outcome: "sold", price: num(archive.price), highBid: null, url: archive.url || null }] : [];
  const prior = archive ? { colour: archive.colour || null, gearbox: archive.transmission || null, mileage: num(archive.mileage), lastSaleDate: iso(archive.soldDate) } : null;
  // an open question (the pool splits and the expert has not picked) reads no tier pool: the tier fields on a mixed pool are for no car
  const openAsk = askOfAnswer(a), asks = [...chain.asks, ...(openAsk ? [{ ...openAsk, selected: null, fromVin: false }] : [])].map(({ refine, ...q }) => ({ ...q, options: q.options.map(({ refine: r2, ...o }) => o) }));
  const tierState = openAsk ? "needs_choice" : a.tierPoolState;
  const poolCards = tier && Array.isArray(a.tierPoolCards) && a.tierPoolCards.length ? a.tierPoolCards : (tier && Array.isArray(a.tierComparables) ? a.tierComparables.map(c => ({ ...c, inBand: true })) : null);
  const cardsOf = tier && !openAsk && poolCards ? poolCards : (Array.isArray(a.cards) ? a.cards : []);
  const tierOk = tier && tierState === "ok";
  const saleId = archive && Array.isArray(archive.sales) && archive.sales[0] ? archive.sales[0].id : null;
  const carTier = d.carTier && saleId ? await d.carTier(env, saleId).catch(() => null) : null;
  // The halves of the SAME tier pool the engine returned (by price, the middle sale of an odd pool in neither): the analyst's plus or minus hint. Ranks only, no new figure.
  // the median is taken from the sales inside the mileage band only, so the marks are found over those
  const bandCards = tierOk ? cardsOf.filter(c => c.inBand !== false) : cardsOf;   // (cards with no inBand flag are untiered-view cards: all of them)
  const halfOf = halfFinder(bandCards, tierOk), midOf = middleFinder(bandCards, tierOk), inBandOf = c => (c.inBand == null ? null : !!c.inBand);
  const splits = []; for (const o of Array.isArray(a.options) ? a.options : []) { let g = splits.find(s => s.dimension === o.dimension); if (!g) splits.push(g = { dimension: o.dimension, options: [] }); g.options.push({ label: o.label, value: o.value == null ? null : String(o.value), count: num(o.n), low: num(o.low), high: num(o.high), median: num(o.median), windowWords: o.windowWords || null }); }
  // The split's counts against the headline count: each option is read over its own window (the engine says so in optionsRemainder), and a sale whose listing states no body is in the headline and in no option. Said, never left to be found.
  const splitsNote = a.optionsRemainder && typeof a.optionsRemainder.line === "string" && a.optionsRemainder.line ? a.optionsRemainder.line : null;   // the engine counts and names the sales the options leave out (optionsRemainder.line); the page types nothing
  // THE MILEAGE BAND THE MEDIAN IS TAKEN FROM, in words, with the counts that add up: the tier holds N sales, M sit in the band, the rest are listed outside it.
  const band = a.tierMileBand || null, sameN = num(a.tierPoolN), bandN = num(a.tierBandN);
  const bandWords = !band || (band.miMin == null && band.miMax == null) ? null : band.miMin != null && band.miMax != null ? `${mi(band.miMin)} to ${mi(band.miMax)} miles` : band.miMin != null ? `${mi(band.miMin)} miles or more` : `up to ${mi(band.miMax)} miles`;
  const proofLine = tierOk ? (bandWords ? `${TIER_NAMES[tier]} (tier ${tier}) holds ${countNoun(sameN, "sale", { words: false })}. ${bandN} of them sit in the mileage band of ${bandWords} around the car's ${mi(askedMiles)} miles, and the starting figure is the median of those ${bandN}. The other ${sameN - bandN} are listed outside the band.` : `${TIER_NAMES[tier]} (tier ${tier}) holds ${countNoun(sameN, "sale", { words: false })}. No mileage was given, so the starting figure is the median of all ${sameN}.`) : null;
  const out = {
    version: SHEET_READ_VERSION, readAt: new Date().toISOString(), frozen: false, engineVersion: ENGINE_VERSION, salesEpoch: a.salesEpoch || a.warmEpoch || null,
    car: { vin: vin || null, label: carLabel({ year: decode.year, make: decode.make, model: decode.model, trim: decode.trim, body: decode.body }) || [decode.year, decode.make, decode.model, decode.trim].filter(Boolean).join(" "), decode, mileage: askedMiles ? { value: askedMiles, source: input.mileageSource || "asked", ask: null } : { value: null, source: null, ask: "Mileage was not in the submission. Enter it to read the market around it." }, gearbox: (archive && archive.transmission) || vehicle.transmission || null, colour: (archive && archive.colour) || null, prior },
    exact: { appearances, none: appearances.length ? null : "No prior auction record for this VIN." },
    market: {
      window: { months: num(a.windowMonths), stated: a.windowWords || null, fallback: !!a.windowLonger },
      tier: a.tier, count: num(a.poolN) ?? num(a.qualifyingTotal), low: isResult && Array.isArray(a.cluster) ? a.cluster[0] : null, high: isResult && Array.isArray(a.cluster) ? a.cluster[1] : null,
      median: headlineOk ? quant(prices, 0.5) : null, p25: headlineOk ? quant(prices, 0.25) : null, p75: headlineOk ? quant(prices, 0.75) : null, newest: iso(a.latestSaleDate),
      thinLine: a.thinLine || null, basisLine: a.basisLine || null, splits, splitsNote, asks,
      live: ((live && live.rows) || []).map(r => ({ venue: r.platform || r.source || null, bid: num(r.current_bid_usd), endsAt: r.end_time || null, title: r.listing_title || r.title || null, url: r.listing_url || r.url || null })), liveTotal: live ? num(live.total) : null,
      startingFigure: tierOk ? a.startingFigure : null,
      startingNote: !tier ? (openAsk ? [openAsk.reason, `Pick the ${openAsk.noun}, then a condition tier.`].filter(Boolean).join(" ") : "Pick a condition tier for a starting figure.") : openAsk ? [openAsk.reason, `Pick the ${openAsk.noun} and the tier pool is read for it.`].filter(Boolean).join(" ") : a.tierPoolState === "ok" ? proofLine : a.tierPoolState === "too_few" ? a.tierPoolLine : a.tierPoolState === "no_tier_data" ? "Condition tiers are not assigned to these sales yet." : "The condition tier could not be read just now.",
      comparables: cardsOf.slice(0, tierOk ? MAX_PROOF_ROWS : 12).map(c => ({ date: iso(c.date || c.soldDate || c.auction_end_date), venue: c.platformName || c.platform || c.source || c.house || null, price: num(c.price ?? c._usd), mileage: num(c.mi) > 0 && !c.milesHidden ? num(c.mi) : num(c.mileage ?? c.miles), tier: tier && !openAsk ? tier : null, inBand: inBandOf(c), half: inBandOf(c) === false ? null : halfOf(c), mid: inBandOf(c) === false ? null : midOf(c), url: c.url || c.srcurl || null, title: c.title || c.name || c.raw_title || null })),
      wider: tier && a.tierPoolState === "too_few" && isResult && Array.isArray(a.cluster) ? { low: a.cluster[0], high: a.cluster[1], count: num(a.poolN) } : null
    },
    condition: (tier || a.tierPoolState === "counts") && !openAsk ? { tiers: [1, 2, 3, 4].map(t => ({ tier: t, label: TIER_NAMES[t], count: a.tierCounts ? a.tierCounts[t] : null })), untiered: a.tierUntieredN ?? null, selected: tier || null, sameTierCount: a.tierPoolN ?? null, bandCount: a.tierBandN ?? null, state: a.tierPoolState === "counts" ? "not_asked" : a.tierPoolState, tooFew: a.tierPoolState === "too_few", tooFewLine: a.tierPoolState === "too_few" ? a.tierPoolLine : null, bandWords, proofLine }
      : { tiers: [1, 2, 3, 4].map(t => ({ tier: t, label: TIER_NAMES[t], count: null })), untiered: null, selected: tier && openAsk ? tier : null, sameTierCount: null, bandCount: null, state: openAsk ? "needs_choice" : "not_asked", tooFew: false, tooFewLine: null, bandWords: null, proofLine: null },
    coverage: { footer: a.footer || a.coverageLine || "Sold results from the venues the record holds. Private sales and condition are not in the record.", methodology: "Hammer prices with premiums backed out, the same pool, price fence and set asides as the consumer pages, tier from each sale's own listing text." }
  };
  // The signals the engine counted for this car's own record (its words), or the engine's plain line that there are none. Never scored here.
  out.condition.carEvidence = carTier && carTier.evidence.length ? { tier: carTier.tier, lines: carTier.evidence, source: "this car's last sale listing" } : null;
  // a car with no listing in the archive has no signals to count: the line says so (one source, conditionTier.js); a listing that yielded none says the engine counted none
  out.condition.carEvidenceNote = out.condition.carEvidence ? null : (saleId ? "The engine holds no listing signals for this car, so it counted none." : NO_LISTING_LINE);
  return JSON.parse(JSON.stringify(out));
}
export { TIER_FIELDS };
