// WHICH MODELS ARE TIERED FIRST (Lane B, Nov 2026, condition tier backfill). An interrupted backfill must always leave the important pools complete, so the job tiers, in this order:
//   1 the Desk's own pools: the models of the 100 cars of the Hagerty comparison (scripts/hvt100.mjs), as the archive files them (make and model, matched without case);
//   2 the most searched specs: the models of the spec_market_cache keys, ranked by the same search-volume ranking the nightly recompute uses (rankSpecKeysByViews);
//   3 everything else, model by model.
// A model with nothing untiered costs one empty read. The tier rules are not touched by the order: a tier depends on the sale and on its model's mileage quartiles, never on when it was assigned.
import { rankSpecKeysByViews } from "./_specRecompute.js";
import { supabaseSelect } from "./_supabase.js";

const D = {
  "Chevrolet": ["Bel Air", "Corvette", "Camaro", "Chevelle", "C10"],
  "Ford": ["Mustang", "Thunderbird", "Bronco", "F-100", "GT", "Focus", "Shelby GT500", "Shelby GT350"],
  "Plymouth": ["Barracuda", "Cuda"], "Dodge": ["Charger", "Viper", "Challenger"], "Shelby": ["GT350", "GT500"], "Pontiac": ["GTO"], "Cadillac": ["Series 62"],
  "Porsche": ["356", "911", "930", "928", "944", "964", "993", "996", "997", "991", "981", "Carrera GT", "918 Spyder", "Cayman", "Boxster"],
  "Jaguar": ["E-Type"], "Mercedes-Benz": ["190SL", "280SL", "300SL", "560SL", "500E", "SLR McLaren", "SLS AMG"],
  "Austin-Healey": ["3000"], "Alfa Romeo": ["Giulia"], "Datsun": ["240Z"], "Volkswagen": ["Beetle"], "BMW": ["2002", "M3", "M5", "Z3", "M4"],
  "Ferrari": ["250 GT", "365", "Testarossa", "348", "308", "F430", "550 Maranello", "488", "458"],
  "Lamborghini": ["Miura", "Diablo", "Gallardo", "Huracan", "Aventador"], "Toyota": ["Supra", "Land Cruiser"], "Mazda": ["RX-7"], "Acura": ["NSX"],
  "Nissan": ["300ZX", "GT-R"], "Buick": ["Grand National"], "Jeep": ["Grand Wagoneer"], "Land Rover": ["Defender"], "Honda": ["S2000"], "Lexus": ["LFA"], "McLaren": ["MP4-12C", "720S"]
};
export const DESK_UNITS = Object.entries(D).flatMap(([make, models]) => models.map(model => ({ make, model, why: "desk" })));
export const SEARCH_UNITS_CAP = 300;

// make and model are the first two entries of a spec key in every layout the key has had.
const makeModelOf = key => { try { const p = JSON.parse(key); return Array.isArray(p) && p[0] && p[1] ? { make: String(p[0]), model: String(p[1]) } : null; } catch { return null; } };
// The most searched specs' models, in the nightly recompute's own order. Soft: a failed read gives no search units (the Desk units and the rest still run).
export async function searchedUnits(env, { select = supabaseSelect, cap = SEARCH_UNITS_CAP } = {}) {
  let rows = null; try { rows = await select(env, "spec_market_cache?select=spec_key&order=computed_at.desc&limit=1000"); } catch { rows = null; }
  if (!Array.isArray(rows)) return { units: [], read: false };
  const ranked = await rankSpecKeysByViews(env, rows.map(r => r.spec_key).filter(Boolean), select);
  const seen = new Set(), units = [];
  for (const k of ranked) { const p = makeModelOf(k); if (!p) continue; const id = (p.make + "|" + p.model).toLowerCase(); if (seen.has(id)) continue; seen.add(id); units.push({ make: p.make, model: p.model, why: "searched" }); if (units.length >= cap) break; }
  return { units, read: true };
}
// Desk first, then searched, each model once.
export function orderUnits(desk, searched) {
  const seen = new Set(), out = [];
  for (const u of [...desk, ...searched]) { const id = (u.make + "|" + u.model).toLowerCase(); if (seen.has(id)) continue; seen.add(id); out.push(u); }
  return out;
}
export async function buildPriority(env, opts = {}) {
  const s = await searchedUnits(env, opts);
  return { units: orderUnits(DESK_UNITS, s.units), desk: DESK_UNITS.length, searched: s.units.length, searchedRead: s.read };
}
