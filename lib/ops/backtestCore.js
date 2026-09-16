// One Box structural backtest core (Sep 2026). ARCHIVE-ONLY, ZERO OCD: samples real cars from
// canonical_sales and runs the LIVE runOneBox against them, then checks structural invariants on
// the ACTUAL result object (so I2 tests the shipped bracket-selection code, not a stale
// assumption). Shared by the resumable ops task (chunked) and scripts/oneboxBacktest.mjs (full).
import { resolveVehicle } from "../vehicle.js";
import { findGeneration, generationsForModel } from "../generations.js";
import { runOneBox } from "../onebox.js";
import { findVinArchiveMatch } from "../_flags.js";
import { supabaseSelect } from "../_supabase.js";

const MANUAL = t => /manual|\d[- ]?speed(?!\s*auto)|\bmt\b|\bstick\b/i.test(String(t || "")) && !/automatic|pdk|dct|tiptronic|dsg/i.test(String(t || ""));
const AUTO = t => /automatic|\bpdk\b|\bdct\b|tiptronic|\bdsg\b|paddle/i.test(String(t || ""));
const yearIn = s => { const m = /\b(19|20)\d{2}\b/.exec(String(s || "")); return m ? Number(m[0]) : null; };

export function marqueGroup(make) {
  const m = String(make || "").toLowerCase();
  if (/porsche|bmw|mercedes|benz|audi|volkswagen|vw|opel|\bnsu\b/.test(m)) return "German";
  if (/jaguar|aston|lotus|land ?rover|mini|triumph|\bmg\b|bentley|rolls|austin|morgan/.test(m)) return "British";
  if (/ferrari|lamborghini|maserati|alfa|lancia|fiat|de tomaso|abarth/.test(m)) return "Italian";
  if (/chevrolet|ford|dodge|chrysler|plymouth|buick|cadillac|pontiac|oldsmobile|gmc|jeep|shelby|amc/.test(m)) return "American";
  if (/toyota|nissan|datsun|honda|acura|mazda|subaru|mitsubishi|lexus|infiniti|suzuki/.test(m)) return "Japanese";
  return "Other";
}
export function priceTier(usd) {
  const p = Number(usd) || 0;
  if (p < 25000) return "<$25k";
  if (p < 75000) return "$25-75k";
  if (p < 250000) return "$75-250k";
  return "$250k+";
}
// synchronous generation code for (make, model, year) from the curated map; null if unmapped/gap.
function genCodeFor(make, model, year) {
  if (!year) return null;
  const g = generationsForModel(make, model).find(x => year >= x.yearStart && year <= x.yearEnd);
  return g ? g.code : null;
}

// Deterministic seeded shuffle (LCG) so a given seed yields the same sample across chunk calls.
function seededShuffle(arr, seed) {
  let s = (seed >>> 0) || 1; const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Build a stratified random sample from canonical_sales (real cars with VINs). Deterministic for
// a given seed. Strata: price tier (by hammer_usd) x marque; generation-mapped is derived per car.
export async function buildSample(env, { size = 400, seed = 42 } = {}) {
  const tiers = [["lt25", "hammer_usd=lt.25000"], ["mid", "hammer_usd=gte.25000&hammer_usd=lt.75000"], ["hi", "hammer_usd=gte.75000&hammer_usd=lt.250000"], ["top", "hammer_usd=gte.250000"]];
  const pool = [];
  for (const [, f] of tiers) {
    const rows = await supabaseSelect(env, `canonical_sales?${f}&chassis_vin_norm=not.is.null&make=not.is.null&model=not.is.null&year=not.is.null&select=chassis_vin_norm,make,model,year,hammer_usd&order=id.asc&limit=600`) || [];
    pool.push(...rows);
  }
  const uniq = seededShuffle([...new Map(pool.map(r => [r.chassis_vin_norm, r])).values()], seed).map(r => ({
    vin: r.chassis_vin_norm, make: r.make, model: r.model, year: Number(r.year), hammer: Number(r.hammer_usd) || null,
    marque: marqueGroup(r.make), priceTier: priceTier(r.hammer_usd), genMapped: generationsForModel(r.make, r.model).length > 0
  }));
  // Marque-balanced round-robin so a BaT/US-heavy archive does not yield a ~72%-American sample:
  // interleave across marque groups (shuffled within each), capping any one group's dominance,
  // so German / Italian / British / Japanese get genuine coverage - where the generation bugs live.
  const groups = {}; for (const r of uniq) (groups[r.marque] = groups[r.marque] || []).push(r);
  const order = Object.keys(groups); const out = []; let added = true;
  while (out.length < size && added) { added = false; for (const g of order) { if (groups[g].length) { out.push(groups[g].shift()); added = true; if (out.length >= size) break; } } }
  return out;
}

// Run ONE subject through both the matched (VIN) and typed paths; check invariants on each result.
export async function runSubject(env, subj) {
  const out = [];
  const paths = [
    { path: "matched", text: subj.vin, useExact: true },
    { path: "typed", text: `${subj.year} ${subj.make} ${subj.model}`, useExact: false }
  ];
  for (const p of paths) {
    try {
      const rv = await resolveVehicle(p.text, p.useExact ? { vinConfirm: true } : {});
      const vehicle = rv && rv.vehicle ? rv.vehicle : null;
      if (!vehicle || !vehicle.make) { out.push({ ...meta(subj, p.path), tier: rv && rv.status || "unresolved", checked: false, failures: [] }); continue; }
      let exactSale = null;
      if (p.useExact) { const vm = await findVinArchiveMatch(env, { vin: subj.vin }); if (vm && Number(vm.price || vm.sale_price) > 0) exactSale = { price: Number(vm.price || vm.sale_price), mileage: Number(vm.mileage) || null, soldDate: String(vm.soldDate || vm.sale_date || "").slice(0, 10) || null }; }
      const generation = await findGeneration(vehicle, env);
      const r = await runOneBox(vehicle, generation, p.text, { ...env, exactSale }, null);
      out.push({ ...meta(subj, p.path), tier: r.tier, ...checkInvariants(subj, vehicle, r) });
    } catch (e) { out.push({ ...meta(subj, p.path), tier: "error", checked: false, failures: [{ inv: "run", detail: String(e && e.message || e).slice(0, 140) }] }); }
  }
  return out;
}
function meta(subj, path) { return { vin: subj.vin, subject: `${subj.year} ${subj.make} ${subj.model}`, path, marque: subj.marque, priceTier: subj.priceTier, genMapped: subj.genMapped }; }

// The structural invariants, checked against the ACTUAL result object (rule 3 facts).
export function checkInvariants(subj, vehicle, r) {
  if (r.tier !== "result") return { checked: false, failures: [] };
  const fails = [], rep = r.representative || {}, c = rep.closest;
  const subjGen = genCodeFor(subj.make, vehicle.model || subj.model, subj.year);

  // I1: closest match shares the subject's generation (mapped models); else same model token.
  if (c) {
    const closestYear = yearIn(c.title);
    const closestGen = genCodeFor(subj.make, vehicle.model || subj.model, closestYear);
    if (subjGen && closestGen && subjGen !== closestGen) fails.push({ inv: "I1", detail: `closest "${c.title}" gen ${closestGen} != subject ${subj.year} gen ${subjGen}` });
  }
  // I2: brackets genuinely bracket the closest (a MISSING bracket is fine; only a wrong-side one fails).
  if (c && rep.high && rep.high.price <= c.price) fails.push({ inv: "I2", detail: `high bracket $${rep.high.price} <= closest $${c.price}` });
  if (c && rep.low && rep.low.price >= c.price) fails.push({ inv: "I2", detail: `low bracket $${rep.low.price} >= closest $${c.price}` });
  // I3: each bracket's delta label is TRUE against the card numbers.
  const labelOk = (b) => {
    if (!b || !c) return null;
    switch (b.delta) {
      case "fewer_miles": return b.mi > 0 && c.mi > 0 && b.mi < c.mi;
      case "more_miles": return b.mi > 0 && c.mi > 0 && b.mi > c.mi;
      case "manual": return MANUAL(b.transmission) && !MANUAL(c.transmission);
      case "automatic": return AUTO(b.transmission) && MANUAL(c.transmission);
      case "earlier": return String(b.date || "") < String(c.date || "");
      case "higher": return b.price > c.price;
      case "lower": return b.price < c.price;
      default: return true;
    }
  };
  for (const b of [rep.high, rep.low]) { const ok = labelOk(b); if (ok === false) fails.push({ inv: "I3", detail: `${b.role} label "${b.delta}" untrue: $${b.price}, ${b.mi}mi, ${b.transmission || "tx?"} vs closest $${c.price}, ${c.mi}mi` }); }
  // I4: cluster falls within span.
  if (r.cluster && r.span && !(r.span[0] <= r.cluster[0] && r.cluster[1] <= r.span[1])) fails.push({ inv: "I4", detail: `cluster [${r.cluster}] not within span [${r.span}]` });
  // I5: any house card shows hammer + all-in.
  for (const b of [rep.closest, rep.high, rep.low]) if (b && b.isHouse && !(b.allIn > 0)) fails.push({ inv: "I5", detail: `${b.role} house card "${b.title}" missing all-in price` });
  // I6: no excluded UK/EU source among the shown cards; divergence only when materially outside.
  const UK = /car\s*&\s*classic|collecting\s*cars|\bthe\s+market\b|pistonheads/i;
  for (const b of [rep.closest, rep.high, rep.low]) if (b && UK.test(String(b.platform || ""))) fails.push({ inv: "I6", detail: `${b.role} card is an excluded UK source: ${b.platform}` });
  if (r.divergence && r.cluster) { const dv = r.divergence, edge = dv.direction === "below" ? r.cluster[0] * 0.9 : r.cluster[1] * 1.1; const material = dv.direction === "below" ? dv.price < edge : dv.price > edge; if (!material) fails.push({ inv: "I6", detail: `divergence fired but $${dv.price} within 10% of cluster [${r.cluster}]` }); }

  return { checked: true, failures: fails };
}

// Group results by invariant AND by stratum, so a concentrated pattern is visible at a glance.
export function summarize(results) {
  const byInv = {}, byStratum = { marque: {}, priceTier: {}, genMapped: {}, path: {} };
  // Coverage: how many result-state runs the invariants actually ran on, per stratum.
  const coverage = { marque: {}, priceTier: {}, genMapped: {}, path: {} };
  let checked = 0, failedRuns = 0;
  const failures = [];
  for (const r of results) {
    if (r.checked) { checked++; for (const dim of ["marque", "priceTier", "genMapped", "path"]) { const k = String(r[dim]); coverage[dim][k] = (coverage[dim][k] || 0) + 1; } }
    if (r.failures && r.failures.length) {
      failedRuns++;
      for (const f of r.failures) {
        byInv[f.inv] = (byInv[f.inv] || 0) + 1;
        const add = (dim) => { const key = String(r[dim]); const d = byStratum[dim]; (d[key] = d[key] || {})[f.inv] = (d[key][f.inv] || 0) + 1; };
        add("marque"); add("priceTier"); add("genMapped"); add("path");
        failures.push({ subject: r.subject, vin: r.vin, path: r.path, marque: r.marque, priceTier: r.priceTier, genMapped: r.genMapped, inv: f.inv, detail: f.detail });
      }
    }
  }
  return { totalRuns: results.length, resultRuns: checked, runsWithFailures: failedRuns, byInvariant: byInv, byStratum, coverage, failures };
}
