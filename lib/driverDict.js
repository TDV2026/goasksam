// Driver dictionary (One Box item 8). Per model family: the facts that actually move price, the
// TITLE PATTERN that identifies each in a real listing, and the chip wording. The engine only ASKS
// a dictionary driver when the pool genuinely splits on it 5+ / 5+ (item 7's driver search); a mined
// attribute is always framed as "listed as" (we read it off the title, we did not inspect the car).
//
// Seeded with the five agreed families. A model outside every family simply has no dictionary
// driver, so the driver search falls back to mileage/gearbox (never a crash, never a blank question).
// Order matters only for the first match; keep families mutually exclusive where possible.
export const DRIVER_FAMILIES = [
  {
    key: "ferrari_classic",
    label: "Ferrari classics",
    match: v => /ferrari/i.test(v.make || "") && Number(v.year) > 0 && Number(v.year) <= 1995,
    drivers: [
      { key: "matching_numbers", re: /matching[-\s]?numbers|numbers[-\s]?matching|original engine/i, q: "One thing moves the price most on these: whether it keeps its original matching-numbers engine. Is yours matching-numbers?", yes: "Matching numbers", no: "Replacement engine" },
      { key: "classiche", re: /classiche/i, q: "Ferrari Classiche certification moves these. Is yours Classiche certified?", yes: "Classiche certified", no: "Not certified" }
    ]
  },
  {
    key: "aircooled_911",
    label: "air-cooled 911s",
    match: v => /porsche/i.test(v.make || "") && /\b(911|930|964|993|912)\b/.test(String(v.model || "") + " " + String(v.trim || "")) && Number(v.year) > 0 && Number(v.year) <= 1998,
    drivers: [
      { key: "sunroof_delete", re: /sunroof[-\s]?delete|sunroof delete|no[-\s]?sunroof|coupe delete/i, q: "On air-cooled 911s a sunroof-delete car reads differently. Is yours a sunroof-delete?", yes: "Sunroof delete", no: "Has a sunroof" }
    ]
  },
  {
    key: "mercedes_300sl",
    label: "300SLs",
    match: v => /mercedes|benz/i.test(v.make || "") && /300\s?sl/i.test(String(v.model || "") + " " + String(v.trim || "")),
    drivers: [
      { key: "alloy_body", re: /alloy[-\s]?body|aluminum[-\s]?body|aluminium[-\s]?body/i, q: "One thing sets 300SLs apart on price: whether it is an alloy-body car. Is yours alloy-bodied?", yes: "Alloy body", no: "Steel body" },
      { key: "rudge", re: /rudge/i, q: "Rudge knock-off wheels move these. Does yours have Rudge wheels?", yes: "Rudge wheels", no: "Standard wheels" }
    ]
  },
  {
    key: "american_muscle",
    label: "muscle cars",
    match: v => /(chevrolet|chevy|ford|dodge|plymouth|pontiac|buick|oldsmobile|mercury|amc)/i.test(v.make || "") && Number(v.year) >= 1960 && Number(v.year) <= 1974,
    drivers: [
      { key: "numbers_matching", re: /matching[-\s]?numbers|numbers[-\s]?matching|numbers[-\s]?correct/i, q: "On these, whether it keeps its numbers-matching drivetrain moves the price most. Is yours numbers-matching?", yes: "Numbers matching", no: "Non-original engine" },
      { key: "documented", re: /marti report|build sheet|broadcast sheet|window sticker|fully documented|tank sticker/i, q: "Documentation moves these. Is yours documented (build sheet, Marti report, tank sticker)?", yes: "Documented", no: "No documentation" }
    ]
  },
  {
    key: "defender",
    label: "Defenders",
    match: v => /land[-\s]?rover/i.test(v.make || "") && /\b(defender|90|110|130)\b/i.test(String(v.model || "") + " " + String(v.trim || "")),
    drivers: [
      { key: "restored", re: /restored|restomod|resto[-\s]?mod|nut[-\s]?and[-\s]?bolt|full rebuild|ground[-\s]?up/i, q: "A restored Defender reads very differently from an original. Is yours a restoration?", yes: "Restored", no: "Original" },
      { key: "engine_swap", re: /ls[-\s]?swap|ls3|ls[-\s]?v8|engine[-\s]?swap|v8[-\s]?swap|corvette engine|crate engine/i, q: "The engine moves Defenders a lot. Does yours have a swapped or upgraded engine?", yes: "Engine swapped", no: "Original engine" }
    ]
  }
];

// The drivers for a resolved vehicle (first matching family), or [] when no family matches.
export function driversForVehicle(v) {
  if (!v || !v.make) return [];
  const fam = DRIVER_FAMILIES.find(f => { try { return f.match(v); } catch (e) { return false; } });
  return fam ? fam.drivers.map(d => ({ ...d, family: fam.label })) : [];
}
export function driverByKey(v, key) {
  return driversForVehicle(v).find(d => d.key === key) || null;
}
