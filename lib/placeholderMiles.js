// A MILEAGE NOBODY STATED (Lane D, lane-d-placeholder-miles, Nov 19 2026). Sellers and dealer systems type a filler where the odometer reading goes: 999,999 (and 99,999 or 9,999,999), 0, 1, a run of one digit (111,111), 12345 and 123456, and
// any figure above 500,000, which no car in the record has on its odometer. A filler is not a mileage: it is NO stated mileage, and everything that reads a stated mileage reads this one function, so no page carries its own rule.
// The live fault: the Greenland, NH 1965 Mustang carried 999,999, the engine took it for the car's own odometer, matched it to the highest mileage band and read that band's few sales alone, so the Sam box printed a spread refusal while the other
// 1965 Mustangs printed a range. Pure, no reads. statedMiles(v): the mileage as a whole positive number, or null when it is missing or a filler. isPlaceholderMiles(v): true only for a number that IS a filler (a missing value is not one).
export const MAX_PLAUSIBLE_MILES = 500000;
const digitsOf = v => { if (v == null || v === "") return null; const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.\-]/g, "")); return Number.isFinite(n) ? n : null; };
const SEQUENCES = new Set([12345, 123456, 1234567, 12345678, 54321, 654321, 7654321]);
export function isPlaceholderMiles(v) {
  const n = digitsOf(v); if (n == null) return false;
  if (n <= 1) return true;                                   // 0 and 1 (and below) are the empty box, not an odometer
  if (n > MAX_PLAUSIBLE_MILES) return true;                  // 999,999, 9,999,999, 1,000,000 and the like
  const s = String(Math.round(n));
  if (s.length >= 5 && /^(\d)\1+$/.test(s)) return true;    // 99,999 and 111,111: one digit repeated
  return SEQUENCES.has(Math.round(n));                       // 12,345 and 123,456
}
export function statedMiles(v) {
  const n = digitsOf(v); if (!(n > 0) || isPlaceholderMiles(n)) return null;
  return Math.round(n);
}

// THE SAME RULE AS A TABLE FILTER (for the sweep and the requeue over the for sale table): every figure at or under 500,000 that isPlaceholderMiles calls a filler, as a list, plus 0 and 1 and anything above the ceiling. A check proves the list and the function agree on every whole number to 1,000,000.
export const PLACEHOLDER_LIST = (() => { const out = new Set(); for (let n = 0; n <= MAX_PLAUSIBLE_MILES; n++) if (isPlaceholderMiles(n)) out.add(n); return [...out].filter(n => n > 1); })();
export const placeholderFilter = () => `or=(mileage.lte.1,mileage.gt.${MAX_PLAUSIBLE_MILES},mileage.in.(${PLACEHOLDER_LIST.join(",")}))`;
