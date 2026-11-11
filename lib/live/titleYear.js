// THE MODEL YEAR OF A LIVE ROW, ONE FUNCTION (Lane B, Nov 11 2026). Find's first card printed "Chevrolet Corvette" (VIN 1G1YZ23J3M5800527, a 1991 ZR-1) with no model year. CAUSE: the card title was [row.year, make, model] joined, and a join of a missing year is "Chevrolet Corvette", not an
// empty string, so the fallback to the listing's own title (which names 1991) never ran; a live row whose year column is empty at the serve (an upsert from a feed record that carried none) printed a title with no year. The pick only judged the year when the car was chosen, never at the serve.
// RULE: the year is the row's own year, else the 4-digit year the listing title names, else the VIN's model year (the same recovery the feed uses); a card with none is no example. Every title the pickers print (Find, Watching, Tasks, Home) builds from this.
import { vinModelYear } from "../vehicle.js";
const YEAR_RE = /\b(18[89]\d|19\d{2}|20\d{2})\b/;
export function yearOf(row) {
  if (!row) return null;
  const own = Number(row.year); if (Number.isFinite(own) && own > 1885 && own < 2100) return own;
  const m = YEAR_RE.exec(String(row.listing_title || "")); if (m) return Number(m[1]);
  const v = String(row.vin_norm || row.vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (v.length === 17) { const y = Number(vinModelYear(v)); if (Number.isFinite(y) && y > 1885 && y < 2100) return y; }
  return null;
}
// year, make, model with the year always in front when one can be found
export const carTitleOf = (row, make = row && row.make, model = row && row.model) => { const y = yearOf(row), t = [y, make, model].filter(Boolean).join(" ").trim(); return t || String((row && row.listing_title) || "").trim(); };
