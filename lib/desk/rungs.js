// THE CONDITION RUNGS OF ONE CAR, READ BY THE ENGINE (Lane D, Nov 9 2026). For a demonstration case to show the range move, a car needs five or more sales in at least two condition rungs. This asks the engine's own sheet read
// (lib/sheetRead.js, the read the Desk makes) for the car at each tier and reports what it answered: the count and the range per rung, or its "too few sales" sentence. It reads and stores nothing and computes no figure.
// Used by the read-only ops task deskrungs (api/usageDashboard.js) and by scripts/deskRungsCheck.mjs over Lane B's fake archive.
import { TIER_NAMES } from "../conditionTier.js";
export const RUNG_TIERS = [1, 2, 3, 4];
const MAX_TIERS = 4;
// full: true also returns the engine's WHOLE answer for each rung, unchanged (the recorded read of the demonstration car is made from it; nothing is computed here).
export async function rungsOf(read, spec, tiers = [2, 3, 4], caseDate = new Date().toISOString().slice(0, 10), { full = false } = {}) {
  const car = { year: Number(spec.year) || null, make: String(spec.make || ""), model: String(spec.model || ""), mileage: Number(spec.mileage) || null, ...(spec.body ? { bodyStyle: String(spec.body) } : {}) };
  const ask = tier => read({ ...car, ...(tier ? { tier } : {}), desk: { caseDate, transmission: spec.transmission || null, label: [car.year, car.make, car.model].filter(Boolean).join(" "), case: { verification: {} }, exclusions: [] } });
  const shape = async tier => {
    const t0 = Date.now(), r = await ask(tier).catch(() => null), e = r && r.desk && r.desk.evidence;
    if (!r || r.retry || !e) {   // not read: say why in the engine's own words when it answered (an open question, a retry), never a zero count
      const ask = r && r.market && r.market.asks && r.market.asks.find(a => a.selected == null), why = !r ? "The engine returned no read for this car." : r.retry ? (r.line || "The engine is still reading.") : ask ? [ask.reason, ask.noun ? `Pick the ${ask.noun}.` : ""].filter(Boolean).join(" ") : r.market && r.market.startingNote ? r.market.startingNote : "The engine answered without a Desk block for this car.";
      return { tier, name: tier ? TIER_NAMES[tier] : "Any condition", read: false, why, ...(ask ? { options: (ask.options || []).map(o => ({ value: o.value, label: o.label, count: o.count })) } : {}), ms: Date.now() - t0 };
    }
    return { tier, name: tier ? TIER_NAMES[tier] : "Any condition", read: true, count: e.count, insufficient: !!e.insufficient, range: e.insufficient ? null : { q1: e.q1, median: e.median, q3: e.q3, low: e.low, high: e.high }, sentence: e.insufficient ? e.sentence : null, ms: Date.now() - t0, ...(full ? { answer: r } : {}) };
  };
  const out = [await shape(null)]; for (const t of (tiers || []).filter(t => RUNG_TIERS.includes(Number(t))).slice(0, MAX_TIERS).map(Number)) out.push(await shape(t));
  const withRange = out.filter(x => x.tier && x.read && !x.insufficient);
  return { car: [car.year, car.make, car.model].filter(Boolean).join(" "), rungs: out, rungsWithRange: withRange.length, moves: withRange.length >= 2 && new Set(withRange.map(x => x.range.median)).size === withRange.length };
}
