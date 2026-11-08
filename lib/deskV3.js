// DESK V3 ENGINE FIELDS (Lane B, Nov 8 2026). One block, desk, on the engine answer when the call is a Desk case (env.desk). The workspace and the customer report print it and compute nothing.
// This file is PURE: it takes rows the engine already read (price, date, miles, platform, tier ...) and a case, and returns the block. Every sentence comes from lib/reasonWords.js.
// Stage 1: evidence with its as of date. Later stages add comparables, outside, quarters, live, condition, factors, original/excluded.
import { reasonLine, deskPopulationWords, deskYearWords, deskMilesWords, deskTierWords, deskRoundDiff } from "./reasonWords.js";
import { countNoun } from "./countNoun.js";
import { photoCandidates, choosePhoto } from "./live/photoRule.js";

export const DESK_STALE_DAYS_DEFAULT = 90;
export const DESK_EVIDENCE_MIN = 3;   // QUESTION_FLOOR: under three sales the engine gives a count and no figure
export const DESK_TIER_MIN = 5;       // TIER_POOL_MIN: a tier's reference needs five
export const quant = (sorted, p) => { if (!sorted.length) return null; const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)); };
const iso = d => (d ? String(d).slice(0, 10) : null);
const dayMs = 86400000;
const days = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / dayMs);
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
    latestSale: latest ? { date: iso(latest.date), price: Math.round(Number(latest.price)), platform: latest.platform || null } : null,
    stale: { days: gap, threshold, flag: gap != null && gap > threshold } };
  if (n < min) return { ...base, insufficient: true, sentence: reasonLine("desk3.insufficient", { what, count: n }), median: null, q1: null, q3: null, low: null, high: null, population: { sentence: reasonLine("desk3.population", { what }) } };
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

// the whole block; later stages extend it
export async function deskBlock(rows, desk = {}, env = null) {
  const pop = rows.filter(r => r.inPopulation !== false);
  const evidence = evidenceOf(pop, rows, desk, env);
  const sub = desk.subjectFacts || {};
  const comparables = await comparablesOf(rows, sub, desk.head || null);
  return { version: 1, evidence, comparables, outside: outsideOf(rows, evidence, sub) };
}
