// SHEET READ (Lane B, Nov 2026, Desk Valuations spec item 2). ONE engine call: a VIN, or a year, make and model, plus a mileage (and a tier when the expert clicked one), returns sections 1 to 4 of the
// valuation sheet as ONE serialisable object (the shape in lib/desk/sheetShape.js). The page and the PDF compute nothing: every figure here is a field of the same oneEngineAnswer the consumer
// pages read (the same pool, price fence, thin rule and set asides), plus the engine's own tier fields (refine.conditionTier, lib/onebox.js withConditionTier).
//   1 car       as resolved: the VIN decode or the typed words, the mileage (submitted, asked, or the engine's ask for it), gearbox and colour from the exact car's own record
//   2 exact     this exact car's record: every appearance the archive holds for the VIN (sold, with price and venue), or the engine's line that there is none
//   3 market    the market read with its window, count, range (the engine's own), median and quartiles of the same pool, the splits (the engine's options), live listings, newest sale
//   4 condition the tier counts over the same pool, the selected tier, the same tier pool and the starting figure (median of the pool after tier and mileage band; null under five)
//   frozen read: version, readAt, the engine stamp and the sales epoch, so a finalised sheet can say which read it froze.
// VIN path = the Market Check VIN path (lib/vinAsTyped.js): the VIN names the car, the typed path reads it, then the car's own facts go on top. Dependencies are injectable so the check runs offline.
import { ownOf, resolvedOwnVehicle, cleanBody, cleanGearbox, archiveLookup } from "./desk/ownCar.js";
import { oneEngineAnswer, withReadFields, ENGINE_VERSION, TIER_FIELDS, obBodyFamily } from "./onebox.js";
import { TIER_NAMES, TIER_VERSION, NO_LISTING_LINE } from "./conditionTier.js";
import { supabaseSelect } from "./_supabase.js";
// the car's label is the inbound email path's naming (lib/desk/intake/carName.js), so a typed sheet and an emailed one read the same
import { carLabel } from "./desk/intake/carName.js";
import { isFailedRead } from "./tools/_shared.js";
import { reasonLine, deskAndList } from "./reasonWords.js";
import { liveOf } from "./deskV3.js";
import { countNoun } from "./countNoun.js";
import { drawMeter } from "./tierMeter.js";
import { listingFacts as listingFactsOf } from "./live/search.js";

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
// body words that stand in for each other on an older car (an open car is filed Roadster, Convertible, Cabriolet or Spider; a closed two door Coupe, Hardtop or Fastback); a word in no group has no sibling and goes straight to all bodies
const CLOSED_BODY = /^(?:hatchback|coupe|sedan|saloon|wagon|suv|hardtop|fastback)$/i, OPEN_NOT = " not convertible, roadster or spyder";   // the open bodies a closed car's read leaves out when the body itself cannot be read
const BODY_SIBLINGS = [["roadster", "convertible", "cabriolet", "spider", "spyder"], ["coupe", "hardtop", "fastback"]];
// the engine's own state for a read with no Desk block, as the table has a sentence for it: a body never sold for the car, too few sales, a question, anything else
const stateOf = x => { const t = String((x && x.tier) || ""); return t === "body_unavailable" ? "unavailable" : /^(thin|refusal)$/.test(t) ? "thin" : /_choice$/.test(t) ? "asks" : "none"; };
const ASK_WORDS = { body: ["Which body style is it?", "body style"], gearbox: ["Which gearbox does it have?", "gearbox"], edition: ["Which edition is it?", "edition"], year: ["Which year is it?", "year"] };
export function askOfAnswer(x) {
  if (!x || !(x.optionsState === "apart" || x.optionsState === "split")) return null;
  const dim = x.headlineDimension; if (!dim || !ASK_WORDS[dim]) return null;
  const opts = (Array.isArray(x.options) ? x.options : []).filter(o => o && o.refine && o.value != null);
  if (opts.length < 2) return null;
  return { dimension: dim, prompt: ASK_WORDS[dim][0], noun: ASK_WORDS[dim][1], reason: x.thinLine || null, options: opts.map(o => ({ label: o.label, value: String(o.value), count: num(o.n), windowWords: o.windowWords || null, refine: o.refine })) };
}
const styleWord = s => { const w = String(s || "").toLowerCase(); return /cabriolet|convertible|roadster|spider|spyder|drophead/.test(w) ? "convertible" : /coup/.test(w) ? "coupe" : /targa/.test(w) ? "targa" : /sedan|saloon/.test(w) ? "sedan" : /wagon|estate/.test(w) ? "wagon" : /fastback/.test(w) ? "fastback" : null; };
const VIN_MEMO = new Map();
const refineOfPicks = picks => picks.reduce((r, p) => ({ ...r, ...p.refine }), {});
const mi = n => Number(n).toLocaleString("en-US");
async function defaultDeps() {
  const [veh, flags, vin, live] = await Promise.all([import("./vehicle.js"), import("./_flags.js"), import("./vinAsTyped.js"), import("./live/search.js").catch(() => ({}))]);
  return { resolveVehicle: veh.resolveVehicle, decodeVin: veh.decodeVinFacts, archiveMatch: flags.findVinArchiveMatch, liveMatch: (e, o) => import("./vinLiveMatch.js").then(m => m.findVinLiveMatch(e, o)), vinPlan: vin.vinSearchPlan, vinOverlay: vin.applyVinOverlay, liveFor: live.liveForFamily, generationFor: null, carTier: carTierOf };
}

// input: { vin } | { year, make, model, trim?, bodyStyle? }, plus { mileage, tier }. Returns the sheetRead object, or null when the car cannot be read (never an invented read).
export async function sheetRead(env, input = {}, deps = null) {
  const d = deps || await defaultDeps();
  const tier = [1, 2, 3, 4].includes(Number(input.tier)) ? Number(input.tier) : null, askedMiles = num(String(input.mileage == null ? "" : input.mileage).replace(/[^\d.]/g, "")) || null;
  const vin = input.vin && VIN_RE.test(String(input.vin).toUpperCase().replace(/[^A-Z0-9]/g, "")) ? String(input.vin).toUpperCase().replace(/[^A-Z0-9]/g, "") : (input.vin ? String(input.vin).toUpperCase() : null);
  // 1. the car as resolved
  let vehicle = null, decode = null, archive = null, plan = null;
  if (vin) {
    // THE VIN'S OWN FACTS (archive match, decode) do not change between two clicks on the same sheet: read once and kept ten minutes, so a tier or body click re-reads the market only (speed, Nov 8 2026). A caller that passes its own deps (a check) is never cached.
    const memo = !deps ? VIN_MEMO.get(vin) : null;
    var facts;
    var liveMatch = null, archiveFailed = false, ownVeh = null;
    if (memo && Date.now() - memo.at < 600000) { archive = memo.archive; facts = memo.facts; liveMatch = memo.liveMatch || null; ownVeh = memo.ownVeh || null; }
    else {
      // the archive match, the decode and the live match do not depend on one another: asked together (Nov 13 2026; they were awaited one after the other)
      const [al, f0, lm] = await Promise.all([d.archiveMatch ? archiveLookup(d.archiveMatch, env, vin) : { archive: null, failed: false }, d.decodeVin ? Promise.resolve(d.decodeVin(vin)).catch(() => null) : null, d.liveMatch ? Promise.resolve(d.liveMatch(env, { vin })).catch(() => null) : null]);   // the VIN's own live listing: the same step every door takes (lib/vinLiveMatch.js)
      archive = al.archive; archiveFailed = al.failed; facts = f0; liveMatch = lm;
      if (!deps && !archiveFailed && (archive || facts || liveMatch)) VIN_MEMO.set(vin, { at: Date.now(), archive, facts, liveMatch });
    }
    const fromVin = facts && facts.make && facts.model && num(facts.year) > 0 ? { year: num(facts.year), make: facts.make, model: facts.model, trim: facts.trim || null, bodyStyle: facts.bodyStyle || facts.body || cleanBody(archive && archive.bodyStyle) || null, transmission: facts.transmission || cleanGearbox(archive && archive.transmission) || null, vin } : (archive && archive.year && archive.make && archive.model ? { year: num(archive.year), make: archive.make, model: archive.model, trim: null, bodyStyle: cleanBody(archive.bodyStyle), vin } : null);
    if (!fromVin) return null;
    if (liveMatch && !archive) { const { liveVehicleOf } = await import("./vinLiveMatch.js"); const lv = await liveVehicleOf(liveMatch, fromVin, d.resolveVehicle).catch(() => null); if (lv) Object.assign(fromVin, { ...lv, trim: lv.trim || null, vin }); }   // the car its own listing names
    const planP = d.vinPlan ? d.vinPlan(fromVin, { resolveVehicle: d.resolveVehicle, archive, live: liveMatch && liveMatch.listing ? { title: liveMatch.listing.title || null, mileage: liveMatch.listing.mileage || null } : null, liveMatch }).catch(() => null) : Promise.resolve({ vehicle: fromVin, text: [fromVin.year, fromVin.make, fromVin.model].join(" "), ctx: null });
    // the car's own listing is resolved WHILE the plan is (two resolver calls each, independent), and once per VIN, not once per read (Nov 13 2026)
    const ownP = ownVeh || (archive ? resolvedOwnVehicle(archive, d.resolveVehicle, facts).catch(() => null) : null);
    [plan, ownVeh] = await Promise.all([planP, ownP]);
    { const m = !deps ? VIN_MEMO.get(vin) : null; if (m && ownVeh) m.ownVeh = ownVeh; }
    if (!plan || plan.unresolved || !plan.vehicle) return null;
    vehicle = plan.vehicle;
    // THE VIN'S OWN BODY AND TRIM RIDE ON THE VEHICLE OF THE FIRST READ (Lane D, Nov 11 2026): a new case is read once, with the VIN alone, so the decode's body and trim cannot wait for a second read that carries them from the case
    if (fromVin.bodyStyle && !vehicle.bodyStyle) vehicle = { ...vehicle, bodyStyle: fromVin.bodyStyle };
    if (fromVin.trim && !vehicle.trim) vehicle = { ...vehicle, trim: fromVin.trim };
    decode = { year: fromVin.year, make: fromVin.make, model: fromVin.model, trim: fromVin.trim, body: fromVin.bodyStyle, transmission: fromVin.transmission || null, source: "vin" };
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
  // THE BODY AND TRIM THE CASE HOLDS RIDE ON THE VEHICLE WHETHER THE CAR CAME BY VIN OR BY TYPED WORDS (Lane D, Nov 11 2026): a VIN case's decoded body used to be dropped here (only the typed branch took it), so the read pooled Cabriolets with Coupes. The pool, the live rows and the sheet all read the vehicle.
  if (input.bodyStyle && !vehicle.bodyStyle) vehicle = { ...vehicle, bodyStyle: String(input.bodyStyle) };
  if (input.trim && !vehicle.trim) vehicle = { ...vehicle, trim: String(input.trim) };
  decode = { ...decode, body: vehicle.bodyStyle || decode.body || null, trim: vehicle.trim || decode.trim || null };
  let text = (plan && plan.text) || [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  // 3 + 4. the SAME answer a typed search reads; with a tier, the engine's own tier fields on it. The mileage rides as the band the tier pool is cut by (the base answer is the untiered one).
  // picks = the options the expert chose from a split (see askOfAnswer): each is checked against the engine's own options at that step, so a stale or invented pick is dropped.
  const own = vin ? ownOf(archive, typeof liveMatch !== "undefined" ? liveMatch : null, ownVeh) : null;   // the VIN step's own record of the car, as figures (lib/desk/ownCar.js)
  const saleId = archive && Array.isArray(archive.sales) && archive.sales[0] ? archive.sales[0].id : null;
  const carTier = d.carTier && saleId ? await d.carTier(env, saleId).catch(() => null) : null;
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
    return { applied, asks, res: await oneEngineAnswer(vehicle, null, text, input.desk ? { ...env, desk: { caseDate: input.desk.caseDate || null, subject: { transmission: input.desk.transmission || null, body: (vehicle && vehicle.bodyStyle) || null, label: input.desk.label || null, miles: askedMiles }, head: input.desk.head || null, excludedIds: input.desk.excludedIds || [], exclusions: input.desk.exclusions || [], exclusionScope: input.desk.exclusionScope || {}, windowMonths: input.desk.windowMonths || null, views: input.desk.views === true, reserve: input.desk.reserve != null ? input.desk.reserve : null, case: own && own.last ? { ...(input.desk.case || {}), own: { date: own.last.date, price: own.last.price, miles: own.last.miles } } : (input.desk.case || null), carTier: carTier || input.desk.carTier || null } } : env, tierRefine(refineOfPicks(applied))) };
  };
  let chain = await runChain(wanted);
  let res = chain.res, a = res && res.raw;
  // A TYPED BODY THE ARCHIVE CANNOT READ IS NEVER A REFUSAL (Lane B, Nov 10 2026, older cars): when a Desk read comes back with no Desk block and the car has a typed body, the body's sibling words are tried, then all bodies; the words and the engine's states that
  // had no read are named in desk.bodyNote ("Roadster and Convertible were not read ... so all bodies are read."). A pick the expert made from the engine's own question is never overridden.
  const hasDesk = x => !!(x && x.desk && x.desk.evidence), bodyFailed = []; let openOut = false;
  const typedBody0 = vehicle && vehicle.bodyStyle ? String(vehicle.bodyStyle) : null;
  if (input.desk && vehicle && vehicle.bodyStyle && a && !isFailedRead(a) && !hasDesk(a) && !askOfAnswer(a) && !wanted.some(p => p.dimension === "body")) {
    const typed = String(vehicle.bodyStyle), closed = CLOSED_BODY.test(typed), tries = [...(BODY_SIBLINGS.find(g => g.includes(typed.toLowerCase())) || []).filter(w => w !== typed.toLowerCase()).slice(0, 2), null];
    bodyFailed.push({ word: typed, state: stateOf(a) });
    for (const alt of tries) {
      vehicle = { ...vehicle, bodyStyle: alt }; decode = { ...decode, body: alt };
      // A CLOSED BODY'S LAST TRY KEEPS THE OPEN BODIES OUT (Lane D, Nov 12 2026; Lane C's live run: a Mini decoded as a hatchback read three Convertible sales as comparables). CAUSE: most sales name no body in their title, so the typed body left too few and the last try dropped the body altogether, reading every body. Now the last try is the same read with the engine's own exclusion words ("not convertible, roadster or spyder", lib/exclusions.js), which removes only the sales that name an open body.
      if (!alt && closed) text = text + OPEN_NOT;
      chain = await runChain(wanted); res = chain.res; a = res && res.raw;
      if (hasDesk(a) || isFailedRead(a) || !alt) { if (!alt && closed) openOut = true; break; }
      bodyFailed.push({ word: alt, state: stateOf(a) });
    }
    if (hasDesk(a)) a = { ...a, desk: { ...a.desk, bodyNote: reasonLine(openOut ? "desk4.body_fallback_open" : "desk4.body_fallback", { words: deskAndList(bodyFailed.map(f => f.word.charAt(0).toUpperCase() + f.word.slice(1))), was: bodyFailed.length > 1 ? "were" : "was", reasons: deskAndList([...new Set(bodyFailed.map(f => reasonLine("desk4.state_" + f.state)))]) }), bodyFailed: bodyFailed.map(f => ({ word: f.word, state: f.state })) } };
  }
  // ONE NAME FOR THE CAR (older cars, Nov 10 2026): the Desk title is the engine's title line; a model designation typed with its letter ("356C", "911T" typed as one word) keeps the letter the resolver moved into the generation
  if (input.desk && hasDesk(a) && a.desk.titleLine) {
    const m = String(input.model || "").replace(/\s+/g, ""), base = m.slice(0, -1), t = String(a.desk.titleLine);
    if (/^\d{3}[A-Za-z]$/.test(m) && decode && String(decode.model) === base && !decode.trim && new RegExp("\\b" + base + "\\b(?![A-Za-z])").test(t)) a = { ...a, desk: { ...a.desk, titleLine: t.replace(new RegExp("\\b" + base + "\\b(?![A-Za-z])"), m.slice(0, -1) + m.slice(-1).toUpperCase()) } };
  }
  // THE TYPED BODY IS THE BODY IN THE TITLE (Lane B, Nov 10 2026, Lane F's re-sweep: a typed Hardtop printed "Bel Air Coupe"): the engine scopes a closed two door to its own word (Coupe), so the title it builds can name a sibling of the word the expert typed.
  // When the typed body was read (no fallback) and the title carries a SIBLING of it (BODY_SIBLINGS: Coupe, Hardtop, Fastback; Roadster, Convertible, Cabriolet, Spider), the typed word stands in the title and the label. A body with no sibling is never changed.
  if (input.desk && hasDesk(a) && a.desk.titleLine && typedBody0 && !bodyFailed.length) {
    const typedLc = typedBody0.toLowerCase(), group = BODY_SIBLINGS.find(g => g.includes(typedLc)), t = String(a.desk.titleLine), m = /(?:^|\s)([A-Za-z]+)$/.exec(t), last = m ? m[1].toLowerCase() : null;
    if (group && last && last !== typedLc && group.includes(last)) {
      const word = typedBody0.charAt(0).toUpperCase() + typedBody0.slice(1).toLowerCase(), engineWord = last.charAt(0).toUpperCase() + last.slice(1);   // the spec line names the body too: one word in the header, the typed one
      a = { ...a, desk: { ...a.desk, titleLine: t.replace(/([A-Za-z]+)$/, word), specLine: typeof a.desk.specLine === "string" ? a.desk.specLine.split(" \u00b7 ").map(seg => seg === engineWord ? word : seg).join(" \u00b7 ") : a.desk.specLine } };
    }
  }
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
  // LIVE NOW FOLLOWS THE PICKED BODY (Lane D, Nov 8 2026): the body the expert picked from the engine's own options is the body of the live search (the VIN's decoded body never stands in for it); with the question still open, or an option picked that the live search cannot
  // filter on (gearbox, edition, year), there are no live cars. A Coupe pick never lists a Cabriolet in auction.
  const livePick = chain.applied.find(p => p.dimension === "body"), liveBlocked = !!askOfAnswer(a) || chain.applied.some(p => p.dimension !== "body");
  if (livePick) vehicle = { ...vehicle, bodyStyle: styleWord(livePick.label) || String(livePick.label || "").toLowerCase() };
  const liveRaw = d.liveFor && !liveBlocked ? await d.liveFor(env, vehicle, null, {}, vehicle.bodyStyle ? 60 : 6, Array.isArray(a.cluster) ? { low: a.cluster[0], high: a.cluster[1] } : null).catch(() => null) : null;
  // ONLY LIVE CARS RESOLVED TO THE PICKED BODY (Nov 8 2026): with a body picked, a live car whose own body is another, or unknown, is not listed and not counted
  const bodyOfRow = d.bodyOfRow || (r => { try { return listingFactsOf(r).body || null; } catch { return null; } });
  const wantBody = vehicle.bodyStyle ? String(vehicle.bodyStyle).toLowerCase() : null;
  const liveRows = liveRaw && Array.isArray(liveRaw.rows) ? (wantBody ? liveRaw.rows.filter(r => String(bodyOfRow(r) || "").toLowerCase() === wantBody) : liveRaw.rows) : [];
  const live = liveRaw ? { rows: liveRows.slice(0, 6), total: wantBody ? liveRows.length : liveRaw.total } : null;
  // 2. this exact car
  const appearances = archive && archive.soldDate ? [{ date: iso(archive.soldDate), venue: archive.source || null, outcome: "sold", price: num(archive.price), highBid: null, url: archive.url || null }] : [];
  const prior = archive ? { colour: archive.colour || null, gearbox: archive.transmission || null, mileage: num(archive.mileage), lastSaleDate: iso(archive.soldDate) } : null;
  // an open question (the pool splits and the expert has not picked) reads no tier pool: the tier fields on a mixed pool are for no car
  const openAsk = askOfAnswer(a), asks = [...chain.asks, ...(openAsk ? [{ ...openAsk, selected: null, fromVin: false }] : [])].map(({ refine, ...q }) => ({ ...q, options: q.options.map(({ refine: r2, ...o }) => o) }));
  const tierState = openAsk ? "needs_choice" : a.tierPoolState;
  const poolCards = tier && Array.isArray(a.tierPoolCards) && a.tierPoolCards.length ? a.tierPoolCards : (tier && Array.isArray(a.tierComparables) ? a.tierComparables.map(c => ({ ...c, inBand: true })) : null);
  const tierOk = tier && tierState === "ok";
  // THE FULL POOL (Nov 8 2026): the same tier pool when it holds five or more; otherwise the WHOLE body pool, every sale tagged with its tier. Never a handful.
  const bodyAll = !openAsk && Array.isArray(a.tierBodyComparables) && a.tierBodyComparables.length ? a.tierBodyComparables : (Array.isArray(a.cards) ? a.cards : []);
  const cardsOf = tierOk && !openAsk && poolCards ? poolCards : bodyAll;
  const photoOf = c => { const u = String(c.image || c.photo || c.img || ""); return /^https:\/\//i.test(u) ? u : null; };
  // the meter's pool: the picked tier's sales inside the mileage band (the pool the median is taken from; all of them when no mileage band is cut), else the whole body pool
  const meterCards = tierOk ? cardsOf.filter(c => c.inBand !== false) : cardsOf;
  const metaPrices = meterCards.map(c => num(c.price ?? c._usd)).filter(n => n > 0).sort((x, y) => x - y);
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
  const proofLine = tierOk ? (bandWords ? `${TIER_NAMES[tier]} (tier ${tier}) holds ${countNoun(sameN, "sale", { words: false })}. ${bandN} of them sit in the mileage band of ${bandWords} around the car's ${mi(askedMiles)} miles, and the engine median is taken from those ${bandN}. The other ${sameN - bandN} are listed outside the band.` : `${TIER_NAMES[tier]} (tier ${tier}) holds ${countNoun(sameN, "sale", { words: false })}. No mileage was given, so the engine median is taken from all ${sameN}.`) : null;
  const out = {
    ...(a.vinLiveMatch ? { vinLiveMatch: a.vinLiveMatch, ownLive: a.ownLive || null } : {}),
    ...(own ? { own } : {}),
    desk: a.desk ? { ...a.desk, live: liveOf(liveRows) } : null,
    version: SHEET_READ_VERSION, readAt: new Date().toISOString(), frozen: false, engineVersion: ENGINE_VERSION, salesEpoch: a.salesEpoch || a.warmEpoch || null,
    car: { vin: vin || null, label: (a.desk && a.desk.titleLine) || carLabel({ year: decode.year, make: decode.make, model: decode.model, trim: decode.trim, body: decode.body }) || [decode.year, decode.make, decode.model, decode.trim].filter(Boolean).join(" "), decode, mileage: askedMiles ? { value: askedMiles, source: input.mileageSource || "asked", ask: null } : { value: null, source: null, ask: "Mileage was not in the submission. Enter it to read the market around it." }, gearbox: (archive && archive.transmission) || vehicle.transmission || null, colour: (archive && archive.colour) || null, prior },
    exact: { appearances, none: appearances.length ? null : reasonLine("desk.no_prior_vin") },
    market: {
      window: { months: num(a.windowMonths), stated: a.windowWords || null, fallback: !!a.windowLonger, fallbackLine: a.windowLonger ? reasonLine("desk.window_fallback") : null },
      tier: a.tier, count: num(a.poolN) ?? num(a.qualifyingTotal), low: isResult && Array.isArray(a.cluster) ? a.cluster[0] : null, high: isResult && Array.isArray(a.cluster) ? a.cluster[1] : null,
      median: headlineOk ? quant(prices, 0.5) : null, p25: headlineOk ? quant(prices, 0.25) : null, p75: headlineOk ? quant(prices, 0.75) : null, newest: iso(a.latestSaleDate),
      thinLine: a.thinLine || null, basisLine: a.basisLine || null, splits, splitsNote, asks,
      live: ((live && live.rows) || []).map(r => ({ venue: r.platform || r.source || null, bid: num(r.current_bid_usd), endsAt: r.end_time || null, title: r.listing_title || r.title || null, url: r.listing_url || r.url || null })), liveTotal: live ? num(live.total) : null,
      startingFigure: tierOk ? a.startingFigure : null,
      startingNote: !tier ? (openAsk ? [openAsk.reason, `Pick the ${openAsk.noun}, then a condition tier.`].filter(Boolean).join(" ") : reasonLine("desk.pick_tier")) : openAsk ? [openAsk.reason, `Pick the ${openAsk.noun} and the tier pool is read for it.`].filter(Boolean).join(" ") : a.tierPoolState === "ok" ? proofLine : a.tierPoolState === "too_few" ? a.tierPoolLine : a.tierPoolState === "no_tier_data" ? reasonLine("desk.no_tier_data") : "The condition tier could not be read just now.",
      comparables: cardsOf.slice(0, MAX_PROOF_ROWS).map(c => ({ date: iso(c.date || c.soldDate || c.auction_end_date), venue: c.platformName || c.platform || c.source || c.house || null, photo: photoOf(c), price: num(c.price ?? c._usd), mileage: num(c.mi) > 0 && !c.milesHidden ? num(c.mi) : num(c.mileage ?? c.miles), tier: c.conditionTier != null ? Number(c.conditionTier) : null, inTier: tier && !openAsk && !tierOk ? Number(c.conditionTier) === tier : null, inBand: inBandOf(c), half: inBandOf(c) === false ? null : halfOf(c), mid: inBandOf(c) === false ? null : midOf(c), url: c.url || c.srcurl || null, title: c.title || c.name || c.raw_title || null })),
      body: vehicle.bodyStyle || null,
      poolLine: tier && !openAsk && a.tierPoolState === "too_few" ? a.tierPoolLine : null,
      rangeLine: headlineOk && Array.isArray(a.cluster) && prices.length ? reasonLine("desk.range", { sales: countNoun(prices.length, "sale", { words: false }), low: a.cluster[0], high: a.cluster[1], median: quant(prices, 0.5) }) : null,
      // what the range meter draws, one place: low, p25, median, p75, high of the pool shown (the tier pool when it is read, else the whole body pool), and each sale's price and tier are on comparables
      meter: metaPrices.length && !openAsk ? { scope: tierOk ? "tier" : "body", tier: tierOk ? tier : null, count: metaPrices.length, low: headlineOk && Array.isArray(a.cluster) && !tierOk ? a.cluster[0] : metaPrices[0], p25: quant(metaPrices, 0.25), median: quant(metaPrices, 0.5), p75: quant(metaPrices, 0.75), high: headlineOk && Array.isArray(a.cluster) && !tierOk ? a.cluster[1] : metaPrices[metaPrices.length - 1] } : null
    },
    condition: (tier || a.tierPoolState === "counts") && !openAsk ? { tiers: [1, 2, 3, 4].map(t => ({ tier: t, label: TIER_NAMES[t], count: a.tierCounts ? a.tierCounts[t] : null })), untiered: a.tierUntieredN ?? null, untieredLine: a.tierUntieredN != null ? reasonLine("desk.untiered", { n: a.tierUntieredN }) : null, selected: tier || null, sameTierCount: a.tierPoolN ?? null, bandCount: a.tierBandN ?? null, state: a.tierPoolState === "counts" ? "not_asked" : a.tierPoolState, tooFew: a.tierPoolState === "too_few", tooFewLine: a.tierPoolState === "too_few" ? a.tierPoolLine : null, bandWords, proofLine }
      : { tiers: [1, 2, 3, 4].map(t => ({ tier: t, label: TIER_NAMES[t], count: null })), untiered: null, selected: tier && openAsk ? tier : null, sameTierCount: null, bandCount: null, state: openAsk ? "needs_choice" : "not_asked", tooFew: false, tooFewLine: null, bandWords: null, proofLine: null },
    coverage: { footer: a.footer || a.coverageLine || "Sold results from the venues the record holds. Private sales and condition are not in the record.", methodology: "Hammer prices with premiums backed out, the same pool, price fence and set asides as the consumer pages, tier from each sale's own listing text." }
  };
  // The signals the engine counted for this car's own record (its words), or the engine's plain line that there are none. Never scored here.
  out.condition.engineTier = carTier && [1, 2, 3, 4].includes(Number(carTier.tier)) ? Number(carTier.tier) : null;   // the engine's own reading of this car's last listing; null = it suggests none
  out.condition.carEvidence = carTier && carTier.evidence.length ? { tier: carTier.tier, lines: carTier.evidence, source: "this car's last sale listing" } : null;
  // a car with no listing in the archive has no signals to count: the line says so (one source, conditionTier.js); a listing that yielded none says the engine counted none
  out.condition.noListing = !out.condition.carEvidence && !saleId;
  out.condition.carEvidenceNote = out.condition.carEvidence ? null : (saleId ? "The engine holds no listing signals for this car, so it counted none." : NO_LISTING_LINE);
  // DESK V3 (Nov 8 2026): in a Desk case the meter IS the evidence block (one source, lib/deskV3.js evidenceOf): the same count and figures, and no meter at all when the evidence is insufficient
  if (a.desk && a.desk.evidence && !openAsk) {
    const ev = a.desk.evidence, was = out.market.meter;
    out.market.meter = ev.insufficient ? null : { scope: tierOk ? "tier" : "body", tier: tierOk ? tier : null, count: ev.count, low: ev.low, p25: ev.q1, median: ev.median, p75: ev.q3, high: ev.high };
  }
  // the range meter is drawn from the pool the sheet lists: axis, step and every sale's position ride on it (lib/tierMeter.js)
  if (out.market.meter) out.market.meter = drawMeter(out.market.meter, out.market.comparables, tier && !openAsk ? tier : 0);
  return JSON.parse(JSON.stringify(out));
}
export { TIER_FIELDS };
