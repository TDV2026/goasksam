// WHAT A VIN'S OWN CODE SAYS ABOUT THE TRIM (Lane B, Nov 3 2026, lane-b-vinpool item 1). VIN WP0AA29985S716137 is a 997 Carrera coupe; the partner page answered "Carrera and Carrera S" with Carrera S sales ($71,255 and $91,759) in the pool, because the decode names only the
// family word. The 997's VIN code separates Carrera and Carrera 4 (WP0AA) from Carrera S and 4S (WP0AB), so the VIN rules the S out. THE RULE: when a VIN's code allows some of a model's trims and rules the rest out, the pool keeps the allowed ones and
// the ruled-out trims' sales are left out (refine.exceptTrims), before any trim question is asked; two allowed siblings are asked between those two only.
// THE TABLE IS DATA, one row per rule, each with the source it came from; a rule not in the table is never guessed (rule 1: nothing invented). Rows come from a person who knows the code or from the archive (scripts/learnVinTrimCodes.mjs prints the
// VIN prefixes whose sales all carry the same trims, for a person to confirm and add).
//   make, model: as the engine names them; years: [from, to]; vin: a pattern on the 17 characters; allowed: the trims the code allows; ruledOut: the trims it rules out; source: who said so.
export const VIN_TRIM_RULES = [
  { make: "Porsche", model: "911", years: [2005, 2012], vin: /^WP0AA/, allowed: ["Carrera", "Carrera 4"], ruledOut: ["Carrera S", "Carrera 4S"], source: "Sam, Nov 3 2026 (997 VIN code)" },
  { make: "Porsche", model: "911", years: [2005, 2012], vin: /^WP0AB/, allowed: ["Carrera S", "Carrera 4S"], ruledOut: ["Carrera", "Carrera 4"], source: "Sam, Nov 3 2026 (997 VIN code)" }
];
const norm = x => String(x == null ? "" : x).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const trimSlugOf = t => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// the ruling for one VIN car, or null when no rule covers it. rules is a parameter so a check can hold other makes' rules without touching the table.
export function vinTrimRuling({ vin, year, make, model }, rules = VIN_TRIM_RULES) {
  const v = String(vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (v.length !== 17) return null;
  const y = Number(year);
  const r = (rules || []).find(x => norm(x.make) === norm(make) && norm(x.model) === norm(model) && y >= x.years[0] && y <= x.years[1] && x.vin.test(v));
  return r ? { allowed: r.allowed.slice(), ruledOut: r.ruledOut.slice(), exceptTrims: r.ruledOut.map(trimSlugOf), source: r.source } : null;
}
