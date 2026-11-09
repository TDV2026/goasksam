// THE CONDITION RUNGS OF ONE CAR, READ BY THE ENGINE (Lane D, Nov 9 2026). For a demonstration case to show the range move, a car needs five or more sales in at least two condition rungs. This asks the engine's own sheet read
// (lib/sheetRead.js, the read the Desk makes) for the car at each tier and reports what it answered: the count and the range per rung, or its "too few sales" sentence. It reads and stores nothing and computes no figure.
// Used by the read-only ops task deskrungs (api/usageDashboard.js) and by scripts/deskRungsCheck.mjs over Lane B's fake archive.
import { TIER_NAMES } from "../conditionTier.js";
export const RUNG_TIERS = [1, 2, 3, 4];
const MAX_TIERS = 4;
export async function rungsOf(read, spec, tiers = [2, 3, 4], caseDate = new Date().toISOString().slice(0, 10)) {
  const car = { year: Number(spec.year) || null, make: String(spec.make || ""), model: String(spec.model || ""), mileage: Number(spec.mileage) || null, ...(spec.body ? { bodyStyle: String(spec.body) } : {}) };
  const ask = tier => read({ ...car, ...(tier ? { tier } : {}), desk: { caseDate, transmission: spec.transmission || null, label: [car.year, car.make, car.model].filter(Boolean).join(" "), case: { verification: {} }, exclusions: [] } });
  const shape = async tier => {
    const t0 = Date.now(), r = await ask(tier).catch(() => null), e = r && r.desk && r.desk.evidence;
    if (!r || r.retry || !e) return { tier, name: tier ? TIER_NAMES[tier] : "Any condition", read: false, ms: Date.now() - t0 };
    return { tier, name: tier ? TIER_NAMES[tier] : "Any condition", read: true, count: e.count, insufficient: !!e.insufficient, range: e.insufficient ? null : { q1: e.q1, median: e.median, q3: e.q3, low: e.low, high: e.high }, sentence: e.insufficient ? e.sentence : null, ms: Date.now() - t0 };
  };
  const out = [await shape(null)]; for (const t of (tiers || []).filter(t => RUNG_TIERS.includes(Number(t))).slice(0, MAX_TIERS).map(Number)) out.push(await shape(t));
  const withRange = out.filter(x => x.tier && x.read && !x.insufficient);
  return { car: [car.year, car.make, car.model].filter(Boolean).join(" "), rungs: out, rungsWithRange: withRange.length, moves: withRange.length >= 2 && new Set(withRange.map(x => x.range.median)).size === withRange.length };
}
