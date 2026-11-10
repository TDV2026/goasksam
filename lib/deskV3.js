// DESK V3 ENGINE FIELDS (Lane B, Nov 8 2026). One block, desk, on the engine answer when the call is a Desk case (env.desk). The workspace and the customer report print it and compute nothing.
// This file is PURE: it takes rows the engine already read (price, date, miles, platform, tier ...) and a case, and returns the block. Every sentence comes from lib/reasonWords.js.
// Stage 1: evidence with its as of date. Later stages add comparables, outside, quarters, live, condition, factors, original/excluded.
import { reasonLine, deskPopulationWords, deskYearWords, deskMilesWords, deskTierWords, deskRoundDiff, deskDateWords, deskMoneyList, deskAndList } from "./reasonWords.js";
import { countNoun } from "./countNoun.js";
import { assignTier, modelMileBands, TIER_NAMES, MIN_SIGNALS } from "./conditionTier.js";
import { factorFamilyFor } from "./modelRules.js";
import { photoCandidates, choosePhoto } from "./live/photoRule.js";

export const DESK_STALE_DAYS_DEFAULT = 90;
export const DESK_EVIDENCE_MIN = 3;   // QUESTION_FLOOR: under three sales the engine gives a count and no figure
export const DESK_TIER_MIN = 5;       // TIER_POOL_MIN: a tier's reference needs five
export const quant = (sorted, p) => { if (!sorted.length) return null; const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)); };
const iso = d => (d ? String(d).slice(0, 10) : null);
const dayMs = 86400000;
const days = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / dayMs);
// DESK V4 STAGE 1, WINDOWS. The case picks one window (desk.windowMonths, 6, 12 or 24, default 12); desk.evidence IS that window, so market.meter (which is the evidence) is that window too. byWindow carries all three, each read from the same population.
export const WINDOWS = [6, 12, 24], WINDOW_DEFAULT = 12;
export const windowMonthsOf = desk => { const m = Number(desk && desk.windowMonths); return WINDOWS.includes(m) ? m : WINDOW_DEFAULT; };
export function cutoffOf(caseDate, months) { const d = new Date(String(caseDate) + "T00:00:00Z"), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - months); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.toISOString().slice(0, 10); }
// the sales of a window: dated, on or after the cutoff; a sale with no date cannot be placed in a window
export const inWindow = (rows, caseDate, months) => { const c = cutoffOf(caseDate, months); return (rows || []).filter(r => iso(r.date) && iso(r.date) >= c); };
export function staleThreshold(env) { const v = Number(env && env.DESK_STALE_DAYS != null ? env.DESK_STALE_DAYS : (typeof process !== "undefined" && process.env && process.env.DESK_STALE_DAYS)); return Number.isFinite(v) && v > 0 ? Math.round(v) : DESK_STALE_DAYS_DEFAULT; }

// rows: [{ id, price, date, miles, platform, tier, ... }] (the engine's normalised sales). desk: the case ({ caseDate, tier, miles band, subject {transmission, body, label, tierName} , clusterLow, clusterHigh }).
// population = rows matching the case (the meter's set); matching = every priced sale of the car before the population cut.
export function evidenceOf(population, matching, desk = {}, env = null) {
  const rows = (population || []).filter(r => Number(r.price) > 0), prices = rows.map(r => Number(r.price)).sort((a, b) => a - b), n = prices.length;
  const sub = desk.subject || {}, what = deskPopulationWords({ ...sub, miMin: desk.miMin, miMax: desk.miMax });
  const min = desk.tier ? DESK_TIER_MIN : DESK_EVIDENCE_MIN;
  const dated = rows.filter(r => iso(r.date)).sort((a, b) => iso(b.date).localeCompare(iso(a.date))), latest = dated[0] || null;
  const caseDate = iso(desk.caseDate) || iso(new Date().toISOString()), asOf = latest ? iso(latest.date) : null, threshold = staleThreshold(env);
  const gap = asOf ? Math.max(0, days(caseDate, asOf)) : null;
  const base = { asOf, count: n, matching: (matching || []).filter(r => Number(r.price) > 0).length, period: { from: dated.length ? iso(dated[dated.length - 1].date) : null, to: asOf },
    windowMonths: desk.windowMonths || null,
    periodLine: dated.length ? (iso(dated[dated.length - 1].date) === asOf ? reasonLine("desk4.period_day", { on: deskDateWords(asOf) }) : reasonLine("desk4.period", { from: deskDateWords(iso(dated[dated.length - 1].date)), to: deskDateWords(asOf) })) : null,
    latestSale: latest ? { date: iso(latest.date), dateLine: deskDateWords(iso(latest.date)), price: Math.round(Number(latest.price)), platform: latest.platform || null, url: latest.url || null } : null,
    stale: { days: gap, threshold, flag: gap != null && gap > threshold, sentence: null } };
  if (base.stale.flag) base.stale.sentence = reasonLine("desk3.stale", { asOf: deskDateWords(asOf), days: countNoun(gap, "day", { words: false }), threshold: countNoun(threshold, "day", { words: false }) });
  if (n < min) return { ...base, insufficient: true, sentence: desk.windowMonths ? reasonLine("desk4.insufficient_window", { what, months: desk.windowMonths, count: n }) : reasonLine("desk3.insufficient", { what, count: n }), median: null, q1: null, q3: null, low: null, high: null, population: { sentence: reasonLine("desk3.population", { what }) } };
  return { ...base, insufficient: false, sentence: null, median: quant(prices, 0.5), q1: quant(prices, 0.25), q3: quant(prices, 0.75),
    low: Number.isFinite(desk.clusterLow) && !desk.tier ? desk.clusterLow : prices[0], high: Number.isFinite(desk.clusterHigh) && !desk.tier ? desk.clusterHigh : prices[n - 1],
    population: { sentence: reasonLine("desk3.population", { what }) } };
}

// STAGE 2, COMPARABLES. rows carry { id, title, year, generation, body, gearbox ("manual"|"automatic"|null), gearboxWord, miles, platform, date, price, url, photo, tier, inPopulation }.
// subject = { year, generation, body, gearbox, miles, tier }. relevance comes from the VERIFIED year, generation, body, gearbox and miles distance, never the model name:
//   close   = same year, same generation, same body, same gearbox, miles within the larger of 10,000 or a quarter of the subject's
//   similar = same generation and body, the same gearbox or one the listing does not state
//   anything else (another generation, another body, a different gearbox from the one asked when the gearbox is the population) is not close or similar.
// A sale outside the population (another gearbox, tier or mileage band) is still listed, inPopulation false, when it is the same generation and body.
export const PHOTO_COMPS = 24;
const sameBody = (a, b) => !!a && !!b && String(a).toLowerCase().replace(/[^a-z]/g, "") === String(b).toLowerCase().replace(/[^a-z]/g, "");
export function relevanceOf(r, sub) {
  if (!sub.generation || !r.generation || r.generation !== sub.generation) return null;   // the generation is verified or the sale is not a comparable
  if (!sub.body || !r.body || !sameBody(r.body, sub.body)) return null;
  const boxKnown = !!(sub.gearbox && r.gearbox), boxSame = boxKnown && sub.gearbox === r.gearbox, boxOpen = !sub.gearbox || !r.gearbox;
  if (!boxSame && !boxOpen) return r.gearbox ? "other_box" : null;
  const near = Number.isFinite(sub.miles) && sub.miles > 0 && r.miles > 0 && Math.abs(r.miles - sub.miles) <= Math.max(10000, sub.miles * 0.25);
  return Number(r.year) === Number(sub.year) && boxSame && near ? "close" : "similar";
}
export function whyOf(r, sub) {
  const year = deskYearWords((Number(r.year) || 0) - (Number(sub.year) || 0));
  const box = sub.gearbox && !r.gearbox ? "nobox" : null;
  if (!(r.miles > 0) || !(sub.miles > 0)) return reasonLine("desk3.why_nomiles", { year });
  const miles = deskMilesWords(r.miles - sub.miles);
  if (box) return reasonLine("desk3.why_nobox", { year, miles });
  if (r.tier && sub.tier && r.tier !== sub.tier) return reasonLine("desk3.why_tier", { year, miles, tier: deskTierWords(r.tier - sub.tier) });
  return reasonLine("desk3.why", { year, miles });
}
export async function comparablesOf(rows, sub, head = null) {
  const out = [];
  for (const r of rows) {
    let rel = relevanceOf(r, sub), inPop = r.inPopulation !== false;
    if (rel === "other_box") { rel = "similar"; inPop = false; }   // the same generation and body in another gearbox: listed apart, never in the population
    if (!rel) continue;
    const dist = Math.abs((Number(r.year) || 0) - (Number(sub.year) || 0)) * 30000 + (r.miles > 0 && sub.miles > 0 ? Math.abs(r.miles - sub.miles) : 30000) + (r.tier && sub.tier ? Math.abs(r.tier - sub.tier) * 5000 : 0);
    out.push({ r, rel, inPop, dist });
  }
  out.sort((a, b) => (a.rel === b.rel ? 0 : a.rel === "close" ? -1 : 1) || a.dist - b.dist || String(b.r.date || "").localeCompare(String(a.r.date || "")));
  const photos = await Promise.all(out.map(async (o, i) => (i < PHOTO_COMPS && o.r.photo ? await choosePhoto(photoCandidates({ photo_url: o.r.photo }), head || undefined) : null)));
  return out.map((o, i) => ({ id: o.r.id, title: o.r.title || null, year: Number(o.r.year) || null, generation: o.r.generation || null, body: o.r.body || null, transmission: o.r.gearboxWord || null, miles: o.r.miles > 0 ? o.r.miles : null,
    platform: o.r.platform || null, soldDate: iso(o.r.date), price: o.r.price, url: o.r.url || null, photo: photos[i] || null, relevance: o.rel, why: whyOf(o.r, sub), inPopulation: o.inPop }));
}
export const OUTSIDE_MIN = 3;
// one entry per EXCLUDED GEARBOX GROUP with at least three sales, set against the population's median; nothing when the population has no reference or the group is thinner
export function outsideOf(rows, evidence, sub) {
  if (!evidence || evidence.insufficient || !sub.gearbox) return [];
  const groups = new Map();
  for (const r of rows) if (r.inPopulation === false && r.outReason === "transmission" && r.gearboxWord) { if (!groups.has(r.gearboxWord)) groups.set(r.gearboxWord, []); groups.get(r.gearboxWord).push(r.price); }
  const mine = sub.gearbox === "manual" ? "manual" : "automatic";
  return [...groups.entries()].filter(([, v]) => v.length >= OUTSIDE_MIN).map(([label, v]) => {
    const s = v.slice().sort((a, b) => a - b), median = quant(s, 0.5), diff = deskRoundDiff(evidence.median - median);
    const id = diff === 0 ? "desk3.outside_same" : evidence.median > median ? "desk3.outside_less" : "desk3.outside_more";
    return { label, count: s.length, median, low: s[0], high: s[s.length - 1], sentence: reasonLine(id, { group: label, diff, mine, m: countNoun(s.length, "sale", { words: false }), n: evidence.count }) };
  }).sort((a, b) => b.count - a.count);
}

// STAGE 3, QUARTERS AND LIVE. A quarter under DESK_QUARTER_MIN sales (default 3) is shown:false and carries no median, so the page draws nothing for it. Calendar quarters of the population's sale dates, the latest eight, empty ones in between counted 0.
export const DESK_QUARTER_MIN_DEFAULT = 3, QUARTERS_MAX = 8;
export function quarterMin(env) { const v = Number(env && env.DESK_QUARTER_MIN != null ? env.DESK_QUARTER_MIN : (typeof process !== "undefined" && process.env && process.env.DESK_QUARTER_MIN)); return Number.isFinite(v) && v > 0 ? Math.round(v) : DESK_QUARTER_MIN_DEFAULT; }
const qIndex = d => { const y = Number(String(d).slice(0, 4)), m = Number(String(d).slice(5, 7)); return y * 4 + Math.floor((m - 1) / 3); };
const qLabel = k => `Q${(k % 4) + 1} ${Math.floor(k / 4)}`;
export function quartersOf(population, env = null) {
  const dated = (population || []).filter(r => Number(r.price) > 0 && iso(r.date)); if (!dated.length) return [];
  const idx = dated.map(r => qIndex(r.date)), lo = Math.max(Math.min(...idx), Math.max(...idx) - (QUARTERS_MAX - 1)), hi = Math.max(...idx), min = quarterMin(env), out = [];
  for (let k = lo; k <= hi; k++) {
    const ps = dated.filter(r => qIndex(r.date) === k).map(r => Number(r.price)).sort((a, b) => a - b), shown = ps.length >= min;
    out.push({ label: qLabel(k), median: shown ? quant(ps, 0.5) : null, count: ps.length, shown });
  }
  return out;
}
// live auctions of the car (never in evidence or comparables): type bid (a current bid), ask (an asking price, no auction) or no_sale (ended without meeting its reserve, the high bid shown). Read from the live rows the sheet read already has.
export function liveOf(rows) {
  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };
  return (rows || []).map(r => {
    const status = String(r.status || ""), bid = num(r.current_bid_usd), ask = num(r.ask_price_usd ?? r.price_usd);
    const type = /no.?sale|unsold|reserve.?not/i.test(status) ? "no_sale" : (!r.end_time && ask && !bid) ? "ask" : "bid";
    return { title: r.listing_title || r.title || null, platform: r.platform || r.source || null, type, figure: type === "ask" ? ask : bid, ends: r.end_time || null, url: r.listing_url || r.url || null };
  });
}

// STAGE 4, CONDITION AND FACTORS. No invented money: a factor carries an effectSentence only when the population can isolate it (both groups at or above the minimum and their middle halves do not overlap by more than half); otherwise
// the effect is null and the basis says why in words.
const mi = n => Number(n).toLocaleString("en-US");
const nm = k => TIER_NAMES[k];
// The suggested rung (Concours, Excellent, Good, Fair): from the case's own signals when it gives three, else from this car's own last listing, else from the condition the sales near its mileage sold in (5 tiered sales, half or more in one tier), else none.
export function conditionOf(kase, rows, carTier, miles) {
  const c = kase || {}, words = miles > 0 ? `${mi(miles)} miles` : "no stated mileage", note = String(c.notes || "").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim().slice(0, 80);
  let counted = 0;
  if (note || c.titleStatus || c.modifications) {
    const a = assignTier({ listing_title: "", description: note, mileage: miles || null, title_status: c.titleStatus || null, modifications: c.modifications || null }, modelMileBands(rows.map(r => r.miles)));
    counted = a.observed;
    if (a.tier) return { suggested: { tier: a.tier, name: nm(a.tier) }, basis: note ? reasonLine("desk3.cond_signals", { name: nm(a.tier), notes: note, miles: words, count: countNoun(a.observed, "signal", { words: false }) }) : reasonLine("desk3.cond_miles", { name: nm(a.tier), miles: words, count: countNoun(a.observed, "signal", { words: false }) }) };
  }
  if (carTier && [1, 2, 3, 4].includes(Number(carTier.tier))) return { suggested: { tier: Number(carTier.tier), name: nm(Number(carTier.tier)) }, basis: reasonLine("desk3.cond_record", { name: nm(Number(carTier.tier)), count: countNoun(Array.isArray(carTier.evidence) ? carTier.evidence.length : 0, "signal", { words: false }) }) };
  if (miles > 0) {
    const near = rows.filter(r => r.tier && r.miles > 0 && Math.abs(r.miles - miles) <= Math.max(10000, miles * 0.25));
    if (near.length >= DESK_TIER_MIN) {
      const by = {}; for (const r of near) by[r.tier] = (by[r.tier] || 0) + 1;
      const top = Object.entries(by).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      if (top[1] * 2 >= near.length) return { suggested: { tier: Number(top[0]), name: nm(Number(top[0])) }, basis: reasonLine("desk3.cond_nearby", { name: nm(Number(top[0])), k: top[1], t: countNoun(near.length, "tiered sale", { words: false }), miles: `${mi(miles)} miles` }) };
    }
  }
  return { suggested: null, basis: reasonLine("desk3.cond_none", { count: countNoun(counted, "signal", { words: false }), min: "three" }) };
}

export const OVERLAP_MAX = 0.5, FACTOR_MIN = 3, FACTOR_COVERAGE = 0.5;
const VERIFIED = new Set(["verified", "documented", "seller_stated", "not_confirmed"]);
const stats = rows => { const s = rows.map(r => Number(r.price)).sort((a, b) => a - b); return { n: s.length, median: quant(s, 0.5), q1: quant(s, 0.25), q3: quant(s, 0.75) }; };
// two groups, A against B: the effect is isolated when each has FACTOR_MIN sales and their middle halves overlap by no more than OVERLAP_MAX of the narrower
export function isolate(aRows, bRows) {
  const a = stats(aRows), b = stats(bRows);
  if (a.n < FACTOR_MIN || b.n < FACTOR_MIN) return { state: "few", a, b };
  const inter = Math.max(0, Math.min(a.q3, b.q3) - Math.max(a.q1, b.q1)), narrow = Math.min(a.q3 - a.q1, b.q3 - b.q1);
  if ((narrow > 0 ? inter / narrow : (inter > 0 || (a.q1 === b.q1) ? 1 : 0)) > OVERLAP_MAX) return { state: "overlap", a, b };
  return { state: "effect", a, b, diff: deskRoundDiff(a.median - b.median), dir: a.median >= b.median ? "more" : "less" };
}
const idsOf = rows => rows.slice(0, 12).map(r => r.id).filter(x => x != null);
const cap = s => s.replace(/^./, c => c.toUpperCase());
function effectLine(r, a0, b) { const a = cap(a0); return r.diff === 0 ? reasonLine("desk3.effect_same", { a, b, m: countNoun(r.a.n, "sale", { words: false }), n: r.b.n }) : reasonLine("desk3.effect", { a, b, diff: r.diff, dir: r.dir, m: countNoun(r.a.n, "sale", { words: false }), n: r.b.n }); }
export function factorsOf(rows, evidence, quarters, sub, kase, env = null) {
  const out = [], ver = k => { const v = kase && kase.verification && kase.verification[k]; return VERIFIED.has(v) ? v : null; };
  const same = rows.filter(r => relevanceOf(r, sub) !== null).filter(r => !sub.tier || r.tier === sub.tier);   // the car's generation and body (and its tier when one is picked)
  // transmission
  { const man = same.filter(r => r.gearbox === "manual"), aut = same.filter(r => r.gearbox === "automatic"), inPop = !!sub.gearbox;
    const mine = sub.gearbox === "automatic" ? aut : man, other = sub.gearbox === "automatic" ? man : aut, an = sub.gearbox === "automatic" ? "automatic cars" : "manual cars", bn = sub.gearbox === "automatic" ? "manual cars" : "automatic cars";
    const r = isolate(mine, other), support = r.state === "few" ? (mine.length + other.length ? "limited" : "none") : (inPop ? "in_population" : "supported");
    out.push({ key: "transmission", title: "Transmission", support, verification: ver("transmission"), evidenceRef: { ids: [...idsOf(mine), ...idsOf(other)] },
      effectSentence: r.state === "effect" ? effectLine(r, an, bn) : null,
      basis: r.state === "effect" ? reasonLine("desk3.basis_isolated", { m: countNoun(r.a.n, "sale", { words: false }), n: r.b.n }) : r.state === "overlap" ? reasonLine("desk3.basis_overlap", { a: an, b: bn, m: countNoun(r.a.n, "sale", { words: false }), n: r.b.n }) : reasonLine("desk3.basis_few", { a: cap(an), b: bn, m: r.a.n, n: r.b.n, min: "three" }) }); }
  // IMS service, the 996 family only
  if (factorFamilyFor("service_ims", sub.make, sub.model, sub.year, sub.generation)) {
    const popSame = same.filter(r => r.inPopulation !== false), read = popSame.filter(r => typeof r.ims === "boolean"), yes = read.filter(r => r.ims), no = read.filter(r => !r.ims), total = popSame.length;
    if (!total || read.length < Math.ceil(total * FACTOR_COVERAGE)) out.push({ key: "service_ims", title: "IMS service", support: read.length ? "limited" : "none", verification: ver("service_ims"), evidenceRef: null, effectSentence: null, basis: read.length ? reasonLine("desk3.basis_ims_unread", { read: read.length, total: countNoun(total, "sale", { words: false }) }) : reasonLine("desk3.basis_ims_none", { total: countNoun(total, "sale", { words: false }) }) });
    else { const r = isolate(yes, no), kt = { k: yes.length, t: countNoun(read.length, "sale", { words: false }) };
      out.push({ key: "service_ims", title: "IMS service", support: r.state === "effect" ? "supported" : "limited", verification: ver("service_ims"), evidenceRef: { ids: [...idsOf(yes), ...idsOf(no)] },
        effectSentence: r.state === "effect" ? effectLine(r, "cars with IMS work", "those without") : null,
        basis: r.state === "effect" ? reasonLine("desk3.basis_isolated", { m: countNoun(r.a.n, "sale", { words: false }), n: r.b.n }) : r.state === "overlap" ? reasonLine("desk3.basis_ims_overlap", kt) : reasonLine("desk3.basis_ims_few", kt) }); }
  }
  // mileage band: sales under the car's miles against sales over them
  { if (!(sub.miles > 0)) out.push({ key: "mileage_band", title: "Mileage", support: "none", verification: ver("mileage_band"), evidenceRef: null, effectSentence: null, basis: reasonLine("desk3.basis_nomiles") });
    else { const popSame = same.filter(r => r.inPopulation !== false), lo = popSame.filter(r => r.miles > 0 && r.miles < sub.miles), hi = popSame.filter(r => r.miles > 0 && r.miles >= sub.miles), r = isolate(lo, hi), an = `sales under ${mi(sub.miles)} miles`, bn = `sales over them`;
      out.push({ key: "mileage_band", title: "Mileage", support: r.state === "few" ? "limited" : "supported", verification: ver("mileage_band"), evidenceRef: { ids: [...idsOf(lo), ...idsOf(hi)] },
        effectSentence: r.state === "effect" ? effectLine(r, an, bn) : null,
        basis: r.state === "effect" ? reasonLine("desk3.basis_isolated", { m: countNoun(r.a.n, "sale", { words: false }), n: r.b.n }) : r.state === "overlap" ? reasonLine("desk3.basis_overlap", { a: an, b: bn, m: countNoun(r.a.n, "sale", { words: false }), n: r.b.n }) : reasonLine("desk3.basis_few", { a: cap(an), b: bn, m: r.a.n, n: r.b.n, min: "three" }) }); } }
  // owners and cosmetic: the sales do not record them as fields, so nothing is isolated
  out.push({ key: "owners", title: "Owners", support: "none", verification: ver("owners"), evidenceRef: null, effectSentence: null, basis: reasonLine("desk3.basis_unread", { what: "the number of owners" }) });
  out.push({ key: "cosmetic", title: "Cosmetic condition", support: "none", verification: ver("cosmetic"), evidenceRef: null, effectSentence: null, basis: reasonLine("desk3.basis_unread", { what: "cosmetic condition apart from the tier" }) });
  // market movement: the first and the latest quarter that have enough sales
  { const shown = (quarters || []).filter(q => q.shown);
    if (shown.length >= 2) { const f = shown[0], l = shown[shown.length - 1];
      out.push({ key: "market_movement", title: "Market movement", support: "supported", verification: ver("market_movement"), evidenceRef: null, basis: reasonLine("desk3.basis_isolated", { m: countNoun(f.count, "sale", { words: false }), n: l.count }), effectSentence: reasonLine("desk3.move", { from: f.median, to: l.median, q1: f.label, q2: l.label, m: countNoun(f.count, "sale", { words: false }), n: l.count }) }); }
    else out.push({ key: "market_movement", title: "Market movement", support: shown.length ? "limited" : "none", verification: ver("market_movement"), evidenceRef: null, effectSentence: null, basis: reasonLine("desk3.basis_move_few") }); }
  return out;
}

// STAGE 5, RECOMPUTE WITHOUT EXCLUDED SALES. desk.excludedIds [id] with desk.exclusionScope { id: "report_comps" | "market_calc" | "note_only" } (anything else reads as note_only):
//   market_calc  the sale leaves the market calculation: the evidence, the quarters and the factors are read without it (comparables and outside are unchanged)
//   report_comps the sale leaves the report's comparables list only (every figure unchanged)
//   note_only    nothing changes; the exclusion is only echoed in desk.excluded
// desk.original is always the evidence block read with nothing excluded, the same shape as desk.evidence. Nothing is written to a sales record.
export const SCOPES = ["report_comps", "market_calc", "note_only"];
export function exclusionsOf(desk, rows) {
  // Lane D's case record keeps exclusions as [{ saleId, scope, reason, at }]; the same list is accepted here as desk.exclusions, beside desk.excludedIds with desk.exclusionScope
  const fromCase = Array.isArray(desk.exclusions) ? desk.exclusions.filter(e => e && (e.saleId != null || e.id != null)) : [];
  const ids = [...(Array.isArray(desk.excludedIds) ? desk.excludedIds.map(String) : []), ...fromCase.map(e => String(e.saleId != null ? e.saleId : e.id))];
  const scopes = { ...Object.fromEntries(fromCase.map(e => [String(e.saleId != null ? e.saleId : e.id), e.scope])), ...(desk.exclusionScope || {}) }, have = new Set(rows.map(r => String(r.id)));
  return [...new Set(ids)].map(id => ({ id, scope: SCOPES.includes(scopes[id]) ? scopes[id] : "note_only", found: have.has(id) }));
}

// one window of the population: the figures of evidenceOf over the sales of that window only, with the lines the report prints
function windowEntry(pop, matching, desk, env, months) {
  const d = { ...desk, windowMonths: months, clusterLow: null, clusterHigh: null }, sub = desk.subject || {}, what = deskPopulationWords({ ...sub, miMin: desk.miMin, miMax: desk.miMax });
  const e = evidenceOf(inWindow(pop, d.caseDate, months), inWindow(matching, d.caseDate, months), d, env);
  return { months, count: e.count, matching: e.matching, q1: e.q1, median: e.median, q3: e.q3, low: e.low, high: e.high, periodLine: e.periodLine, latestSale: e.latestSale, populationLine: reasonLine("desk4.window_population", { count: countNoun(e.count, "sale", { words: false }), what, months }), insufficient: e.insufficient, sentence: e.sentence };
}
// the evidence of the chosen window, with all three windows beside it
function evidenceWindowed(pop, matching, desk, env) {
  const caseDate = iso(desk.caseDate) || iso(new Date().toISOString()), months = windowMonthsOf(desk), d = { ...desk, caseDate, windowMonths: months, clusterLow: null, clusterHigh: null };
  const e = evidenceOf(inWindow(pop, caseDate, months), inWindow(matching, caseDate, months), d, env);
  return { ...e, windowMonths: months, byWindow: Object.fromEntries(WINDOWS.map(m => [String(m), windowEntry(pop, matching, d, env, m)])) };
}
// DESK V4 STAGE 2, EVERY SALE. desk.sales is the population of the chosen window, newest first, one entry per sale the dot plot draws; a photo is the sale's own listing photo under the photo rule or null, and is looked up for the newest PHOTO_SALES
// only (the rest are null, never a substitute). desk.rungs is the same car's sales of the chosen window by condition rung (the rung of the case does not narrow it): a rung under DESK_TIER_MIN says it has too few for a typical range and lists what they sold for.
export const PHOTO_SALES = 40;
export async function salesOf(pop, months, caseDate, head = null) {
  const rows = inWindow(pop, caseDate, months).filter(r => Number(r.price) > 0).sort((a, b) => iso(b.date).localeCompare(iso(a.date)) || String(a.id).localeCompare(String(b.id)));
  const photos = await Promise.all(rows.map(async (r, i) => (i < PHOTO_SALES && r.photo ? await choosePhoto(photoCandidates({ photo_url: r.photo }), head || undefined) : null)));
  return rows.map((r, i) => ({ id: r.id != null ? r.id : null, price: Math.round(Number(r.price)), dateLine: deskDateWords(iso(r.date)), tier: [1, 2, 3, 4].includes(Number(r.tier)) ? Number(r.tier) : null, titleLine: r.title || null,
    milesLine: r.miles > 0 ? reasonLine("desk4.sale_miles", { miles: r.miles }) : null, platform: r.platform || null, url: r.url || null, photo: photos[i] || null }));
}
export function rungsOf(base, months, caseDate) {
  const win = inWindow(base, caseDate, months).filter(r => Number(r.price) > 0);
  return [1, 2, 3, 4].map(t => {
    const name = TIER_NAMES[t], ps = win.filter(r => Number(r.tier) === t).map(r => Math.round(Number(r.price))).sort((a, b) => a - b), count = ps.length;
    if (count >= DESK_TIER_MIN) { const q1 = quant(ps, 0.25), q3 = quant(ps, 0.75); return { tier: t, name, count, band: { q1, median: quant(ps, 0.5), q3 }, low: ps[0], high: ps[count - 1], sentence: reasonLine("desk4.rung_ok", { name, count: countNoun(count, "sale", { words: false }), q1, q3 }) }; }
    return { tier: t, name, count, band: null, low: count ? ps[0] : null, high: count ? ps[count - 1] : null, sentence: count ? reasonLine("desk4.rung_few", { name, count, months, list: deskMoneyList(ps) }) : reasonLine("desk4.rung_none", { name, months }) };
  });
}
// DESK V4 STAGE 3, THE RESERVE CHECK. desk.reserve (a figure) is set against the chosen window's sales: how many reached it (a price at or above it), where it sits against the typical range (q1 to q3), and whether the sales support it (not above q3).
// desk.reserveStart is q1 of the chosen window with its sentence, to seed a new case; nothing when the window has no typical range. No reserve given, no reserveCheck.
export function reserveCheckOf(sales, evidence, reserve, months) {
  const fig = Number(reserve); if (!(Number.isFinite(fig) && fig > 0)) return null;
  const of = (sales || []).length, reached = (sales || []).filter(s => Number(s.price) >= fig).length;
  const reachedLine = of ? reasonLine("desk4.reserve_reached", { reached, of, noun: of === 1 ? "sale" : "sales" }) : reasonLine("desk4.reserve_nosales", { months });
  if (!evidence || evidence.insufficient) return { reserve: Math.round(fig), reached, of, reachedLine, position: null, positionLine: reasonLine("desk4.reserve_noband"), supported: null };
  const position = fig < evidence.q1 ? "below" : fig > evidence.q3 ? "above" : "inside";
  return { reserve: Math.round(fig), reached, of, reachedLine, position, positionLine: reasonLine("desk4.reserve_position", { where: position, q1: evidence.q1, q3: evidence.q3 }), supported: position !== "above" };
}
export function reserveStartOf(evidence, months) { return evidence && !evidence.insufficient ? { figure: evidence.q1, sentence: reasonLine("desk4.reserve_start", { q1: evidence.q1, months }) } : null; }
// DESK V4 STAGE 4, WHY AND FACTORS. desk.supports and desk.considered are the report's two lists, each item { key, title, line }, built from the factors and the case's verification states (desk.case.verification):
//   supports    a factor the case has VERIFIED or DOCUMENTED and that the sales read (or ownership, which the sales never record): the line says so, and carries the factor's effect sentence only when the sales isolated one (both groups at the minimum)
//   considered  everything else: a seller stated item is ALWAYS here until documented ("Reported by the seller and outstanding until verified."), a not confirmed one, mileage and cosmetic notes taken into account, anything with no state yet. A considered line never carries a dollar figure.
// desk.whyDraft is one or two table sentences from the two lists. Market movement is the market's, not the car's, and is in neither list.
const LIST_KEYS = ["transmission", "service_ims", "mileage_band", "owners", "cosmetic"];
const stateWord = v => v.charAt(0).toUpperCase() + v.slice(1);
const lc = t => (/^[A-Z]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));
export function listsOf(factors, sub, kase) {
  const supports = [], considered = [];
  for (const f of (factors || []).filter(x => LIST_KEYS.includes(x.key))) {
    const title = f.key === "transmission" ? (sub && sub.gearbox ? `${stateWord(sub.gearbox)} gearbox` : "Gearbox") : f.key === "owners" ? "Ownership" : f.title, st = f.verification, read = f.support === "supported" || f.support === "in_population";
    if ((st === "verified" || st === "documented") && (read || f.key === "owners")) {
      const base = reasonLine(read ? "desk4.sup_read" : "desk4.sup_unread", { state: stateWord(st) });
      supports.push({ key: f.key, title, line: read && f.effectSentence ? `${base} ${f.effectSentence}` : base }); continue;
    }
    const kind = st === "seller_stated" ? "reported" : st === "not_confirmed" ? "notconfirmed" : (st === "verified" || st === "documented" || f.key === "mileage_band" || f.key === "cosmetic") ? "noted" : "open";
    considered.push({ key: f.key, title, line: reasonLine({ reported: "desk4.con_reported", notconfirmed: "desk4.con_notconfirmed", noted: "desk4.con_noted", open: "desk4.con_open" }[kind]), kind });
  }
  const names = xs => deskAndList(xs.map((x, i) => (i === 0 ? x.title : lc(x.title)))), many = xs => xs.length > 1, out = [];
  const reported = considered.filter(c => c.kind === "reported"), noted = considered.filter(c => c.kind === "noted");
  const sSup = supports.length ? reasonLine("desk4.why_support", { list: names(supports), verb: many(supports) ? "support" : "supports" }) : null;
  const sRep = reported.length ? reasonLine("desk4.why_reported", { list: names(reported), is: many(reported) ? "are" : "is" }) : null;
  const sNote = noted.length ? reasonLine("desk4.why_noted", { list: names(noted), is: many(noted) ? "are" : "is" }) : null;
  for (const x of [sSup, sRep, sNote]) if (x && out.length < 2) out.push(x);
  return { supports, considered: considered.map(({ key, title, line }) => ({ key, title, line })), whyDraft: out.length ? out.join(" ") : null };
}
// DESK V4 STAGE 5, THE HEADER. desk.titleLine is the engine's own title of the car (lib/onebox.js titleLineOf over resolvedCar), never the typed input; desk.specLine is the car's classified gearbox, body, generation, miles and condition rung, each from the engine's facts, in one line.
const cap1 = s => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
export function specLineOf(sf, desk) {
  const parts = [sf.gearbox ? cap1(sf.gearbox) : null, sf.body && !(desk && desk.titleLine && new RegExp("\\b" + String(sf.body).replace(/[^a-z]/gi, "") + "\\b", "i").test(desk.titleLine)) ? cap1(sf.body) : null, sf.generation ? String(sf.generation) : null, sf.miles > 0 ? reasonLine("desk4.sale_miles", { miles: sf.miles }) : null, desk && desk.tierName ? desk.tierName : null].filter(Boolean);
  return parts.length ? reasonLine("desk4.spec", { parts }) : null;
}
// the whole block; later stages extend it
export async function deskBlock(rows, desk = {}, env = null) {
  const ex = exclusionsOf(desk, rows), calc = new Set(ex.filter(e => e.scope === "market_calc").map(e => e.id)), rep = new Set(ex.filter(e => e.scope === "report_comps").map(e => e.id));
  const sub = desk.subjectFacts || {};
  const original = evidenceWindowed(rows.filter(r => r.inPopulation !== false), rows, desk, env);
  const rowsCalc = rows.filter(r => !calc.has(String(r.id))), pop = rowsCalc.filter(r => r.inPopulation !== false);
  const evidence = calc.size ? evidenceWindowed(pop, rowsCalc, desk, env) : original;
  const comparables = await comparablesOf(rows.filter(r => !rep.has(String(r.id))), sub, desk.head || null);
  const quarters = quartersOf(pop, env), kase = desk.case || null;
  const months = windowMonthsOf(desk), when = iso(desk.caseDate) || iso(new Date().toISOString());
  const sales = await salesOf(pop, months, when, desk.head || null), rungs = rungsOf(rowsCalc.filter(r => r.outReason !== "transmission"), months, when);
  const reserveCheck = reserveCheckOf(sales, evidence, desk.reserve, months), reserveStart = reserveStartOf(evidence, months);
  const factors = factorsOf(rowsCalc, evidence, quarters, sub, kase, env), why = listsOf(factors, sub, kase);
  return { version: 1, titleLine: desk.titleLine ? String(desk.titleLine) : null, specLine: specLineOf(sub, desk), evidence, original, excluded: ex, sales, rungs, reserveCheck, reserveStart, comparables, outside: outsideOf(rows, evidence, sub), quarters, live: [], condition: conditionOf(kase, rowsCalc, desk.carTier || null, sub.miles || null), factors, whyDraft: why.whyDraft, supports: why.supports, considered: why.considered };
}
