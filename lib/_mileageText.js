// Parse an odometer reading from a listing's title + description, for sources whose structured mileage
// is missing or unreliable (MB Market). Trust order (locked):
//   1. an explicit MILES figure adjacent to "mile(s)" - "5k-Mile", "29,000 miles", "w/29k Miles",
//      "shows 5k miles". A trailing "k" multiplies by 1000. Used as-is (not rounded).
//   2. a KILOMETRE figure adjacent to km/kms/kilometre(s), converted to miles and ROUNDED TO THE
//      NEAREST 100 ("16k KMs" -> 16000 km -> 9941.9 mi -> 9,900).
//   When BOTH are stated ("16k KMs (10k miles)") the miles figure wins (found by rule 1 first).
//   "TMU" / "mileage unknown" / a dead-odometer phrase -> null (never guess), even if a number appears.
//   Anything not adjacent to a mile/km unit (engine size "5.0L", model "300SL", price, year, colour
//   code "(744)", chassis/lot number) is ignored. Nothing stated -> null.
// Returns { miles, basis: "miles"|"km", phrase } or null.

const MILES_RE = /(\d[\d.,]*)\s*(k)?[\s-]*miles?\b/gi;
// Exclude km/h and kph (speed, e.g. "0-100 km/h", "top speed 300 km/h") via a negative lookahead:
// a km unit followed by "/h" or "h" is a velocity, never an odometer.
const KM_RE = /(\d[\d.,]*)\s*(k)?[\s-]*(?:kms?|kilomet(?:er|re)s?)\b(?!\s*\/?\s*h)/gi;
const TMU_RE = /\bTMU\b|\bmileage\s+(?:is\s+)?unknown\b|\bunknown\s+mileage\b|\bodometer[^.]{0,40}\b(?:unknown|not\s+known|inoperative|broken|replaced|disconnected|non[\s-]?functional)\b/i;

function parseNum(numStr, kSuffix) {
  // "29,000" -> 29000 ; "5" -> 5 ; "5.0" -> 5 ; a trailing k -> x1000
  const cleaned = String(numStr).replace(/,/g, "");
  let n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (kSuffix) n = n * 1000;
  return n;
}

export function mileageFromText(title, description) {
  const text = `${title || ""} . ${description || ""}`;
  if (!text.trim()) return null;
  if (TMU_RE.test(text)) return null;   // explicit unknown -> never guess
  let m;
  MILES_RE.lastIndex = 0;
  while ((m = MILES_RE.exec(text))) {
    const v = parseNum(m[1], m[2]);
    if (v == null || v < 1 || v > 2000000) continue;   // implausible -> keep scanning
    return { miles: Math.round(v), basis: "miles", phrase: m[0].trim() };
  }
  KM_RE.lastIndex = 0;
  while ((m = KM_RE.exec(text))) {
    const v = parseNum(m[1], m[2]);
    if (v == null || v < 1 || v > 3000000) continue;
    return { miles: Math.round(v * 0.621371 / 100) * 100, basis: "km", phrase: m[0].trim() };
  }
  return null;
}

// e94: a listing whose own title says kilometres ("13k-Kilometer 2001 Lamborghini Diablo VT 6.0 SE") reaches us with a structured
// mileage of 13000 and no unit, and the page printed "13,000 mi". When the title states a kilometre figure (and no miles figure) and the
// structured number IS that figure, the odometer is in kilometres: return it in miles, to the nearest 100 like the text parser does.
// Anything else (a miles title, no unit in the title, a structured number that is not the title's figure) is returned unchanged (null).
export function milesFromKilometerTitle(title, structuredMileage) {
  const t = String(title || ""); const raw = Number(String(structuredMileage == null ? "" : structuredMileage).replace(/[^\d.]/g, ""));
  if (!t || !(raw > 0)) return null;
  MILES_RE.lastIndex = 0; if (MILES_RE.test(t)) return null;
  KM_RE.lastIndex = 0; const m = KM_RE.exec(t); if (!m) return null;
  const km = parseNum(m[1], m[2]); if (km == null) return null;
  if (Math.abs(raw - km) > Math.max(150, km * 0.02)) return null;
  return Math.round(raw * 0.621371 / 100) * 100;
}
