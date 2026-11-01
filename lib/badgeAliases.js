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
