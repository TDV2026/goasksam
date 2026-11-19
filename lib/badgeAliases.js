// BADGE-ENGINEERED CARS THAT ARE FILED UNDER ANOTHER MAKE (Lane B, Nov 1 2026; a reader's "first gen Ford Capri"): the first-generation Capri
// reached the US as a Mercury, sold through Lincoln-Mercury and listed "Mercury Capri" or just "Capri". A search for the Ford car must read those
// listings and sales, shown with the badge as listed, and ONLY inside the years the alias covers: the 1979 to 1986 Fox-body Mercury Capri and the
// 1991 to 1994 Mercury Capri convertible are other cars. One table, tied to the generation (gen is the generation code in lib/generations.js), read by
// the live search (lib/live/search.js) and by the sales pool (lib/onebox.js). Add a line here to add another pair; nothing else changes.
export const BADGE_ALIASES = [
  { make: "Ford", model: "Capri", gen: "Mk1", years: [1970, 1974], as: { make: "Mercury", model: "Capri" } }
];
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function aliasesFor(make, model) {
  const mk = norm(make), md = norm(model);
  return BADGE_ALIASES.filter(a => norm(a.make) === mk && norm(a.model) === md);
}
// The years of the alias that the search reaches: the alias's own years cut to the asked window; null when the window misses them.
export function aliasYears(a, yearMin, yearMax) {
  const lo = Math.max(Number(yearMin) || 0, a.years[0]), hi = Math.min(Number(yearMax) || 9999, a.years[1]);
  return lo <= hi ? [lo, hi] : null;
}

// BADGE TWINS, THE SAME MODEL NAME UNDER TWO MAKES (Lane B, Nov 1 2026; a reader typed "Capri" and "Mercury Capri" and got nothing): a model request with no make reads every make that sold that
// model name, all years (a bare "Capri" is the Ford and the Mercury, the Fox-body Mercury too). A request that names a make stays that make (the Ford Capri alias above reaches the Mercury only
// inside its own years). The first make of a group is the one the engine reads as the car; the others are read beside it. One line per group; the check (scripts/bareModelCheck.mjs) walks this table.
export const BADGE_TWINS = [
  { model: "Capri", makes: ["Ford", "Mercury"] },
  { model: "Neon", makes: ["Plymouth", "Dodge"] },
  { model: "Colt", makes: ["Dodge", "Plymouth"] },
  { model: "Duster", makes: ["Plymouth", "Dodge"] },
  { model: "Suburban", makes: ["Chevrolet", "GMC"] },
  { model: "NSX", makes: ["Acura", "Honda"] }
];
// REBADGED UNDER ANOTHER NAME (listed for Sam, never linked: a reader who types Pinto asks for the Pinto). The sweep names them; add a pair to BADGE_TWINS only when the model name is the same.
export const REBADGED = [
  ["Ford Pinto", "Mercury Bobcat"], ["Ford Maverick", "Mercury Comet"], ["Ford Fairmont", "Mercury Zephyr"], ["Ford Granada", "Mercury Monarch"], ["Ford LTD", "Mercury Marquis"], ["Ford Escort", "Mercury Lynx"],
  ["Ford Falcon", "Mercury Comet"], ["Ford Sierra XR4i", "Merkur XR4Ti"], ["Ford Scorpio", "Merkur Scorpio"], ["Ford Granada", "Lincoln Versailles"], ["Mercury Grand Marquis", "Lincoln Town Car"],
  ["Plymouth Valiant", "Dodge Dart"], ["Plymouth Road Runner", "Dodge Super Bee"], ["Plymouth Satellite", "Dodge Coronet"], ["Plymouth Fury", "Dodge Polara"], ["Plymouth Voyager", "Dodge Caravan"],
  ["Plymouth Laser", "Eagle Talon"], ["Dodge Stealth", "Mitsubishi 3000GT"], ["Chevrolet Camaro", "Pontiac Firebird"], ["Chevrolet Blazer", "GMC Jimmy"], ["Chevrolet Silverado", "GMC Sierra"],
  ["Chevrolet C10", "GMC C1500"], ["Chevrolet Astro", "GMC Safari"], ["Chevrolet Express", "GMC Savana"], ["Opel Kadett", "Buick Opel"], ["Opel GT", "Buick Opel GT"], ["Pontiac Vibe", "Toyota Matrix"],
  ["Pontiac GTO (2004)", "Holden Monaro"], ["Pontiac Solstice", "Saturn Sky"], ["Datsun 240Z", "Nissan Fairlady Z"], ["Daimler Sovereign", "Jaguar XJ6"], ["Rolls-Royce Silver Shadow", "Bentley T-Series"]
];
// The make group of a model name (null when the name is one make's alone).
export function twinGroupOf(model) { const md = norm(model); return BADGE_TWINS.find(g => norm(g.model) === md) || null; }

// THE SAME CAR UNDER TWO NAMES (a listing says XKE, the resolver reads E-Type): every name is the model for the title fence. Read by lib/live/search.js.
export const SAME_CAR_NAMES = [{ make: "Jaguar", names: ["E-Type", "XKE", "XK-E"] }];
export function sameCarNames(make, model) {
  const g = SAME_CAR_NAMES.find(x => norm(x.make) === norm(make) && x.names.some(n => norm(n) === norm(model)));
  return g ? g.names.filter(n => norm(n) !== norm(model)) : [];
}
