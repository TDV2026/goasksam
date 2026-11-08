// DESK V3 ENGINE FIELDS (Lane B, Nov 8 2026). One block, desk, on the engine answer when the call is a Desk case (env.desk). The workspace and the customer report print it and compute nothing.
// This file is PURE: it takes rows the engine already read (price, date, miles, platform, tier ...) and a case, and returns the block. Every sentence comes from lib/reasonWords.js.
// Stage 1: evidence with its as of date. Later stages add comparables, outside, quarters, live, condition, factors, original/excluded.
import { reasonLine, deskPopulationWords } from "./reasonWords.js";

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

// the whole block; later stages extend it
export function deskBlock(rows, desk = {}, env = null) {
  const pop = rows.filter(r => r.inPopulation !== false);
  const evidence = evidenceOf(pop, rows, desk, env);
  return { version: 1, evidence };
}
