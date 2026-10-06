// US distance for /buy (Lane C, Oct 2026). ZIP and city coordinates from the US Census Bureau 2023
// Gazetteer (ZCTA + places, public domain), bundled as lib/live/geo-us.json. Distances are great-circle
// miles between a ZIP centroid and the listing's city centroid: a buyer's "within 50 miles", not a route.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let GEO = null;
function geo() { if (!GEO) GEO = require("./geo-us.json"); return GEO; }

const STATES = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "puerto rico": "PR" };
const ABBR = new Set(Object.values(STATES));
export function stateCode(s) { const t = String(s || "").trim(); if (ABBR.has(t.toUpperCase()) && t.length === 2) return t.toUpperCase(); return STATES[t.toLowerCase()] || null; }

export function zipCoord(zip) { const z = String(zip || "").trim().slice(0, 5); const c = /^\d{5}$/.test(z) ? geo().zips[z] : null; return c ? { lat: c[0], lon: c[1] } : null; }
export function placeCoord(city, state) {
  const st = stateCode(state); if (!st || !city) return null;
  const name = String(city).trim().toLowerCase().replace(/^st\.?\s/, "saint ").replace(/^ft\.?\s/, "fort ").replace(/^mt\.?\s/, "mount ");
  const P = geo().places;
  const c = P[st.toLowerCase() + "|" + name] || P[st.toLowerCase() + "|" + String(city).trim().toLowerCase()];
  return c ? { lat: c[0], lon: c[1], name: c[2], state: st } : null;
}
// A listing's coordinates from its stored location ("Atlanta, GA" / "Beverly Hills, California, US").
export function listingCoord(row) {
  const cc = String(row.country || "").toUpperCase();
  if (cc && cc !== "US") return null;
  const parts = String(row.location || "").split(",").map(s => s.trim()).filter(Boolean).filter(s => !/^(us|usa|united states)$/i.test(s));
  if (parts.length < 2) return null;
  return placeCoord(parts[0], parts[1]);
}
export function milesBetween(a, b) {
  if (!a || !b) return null;
  const R = 3958.8, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
// The named place nearest a point, for "Beverly Hills first" (the biggest-named nearby place wins ties).
export function nearestPlace(pt) {
  if (!pt) return null;
  let best = null, bd = Infinity;
  for (const [k, c] of Object.entries(geo().places)) {
    const d = Math.abs(c[0] - pt.lat) + Math.abs(c[1] - pt.lon);
    if (d < bd) { bd = d; best = { name: c[2], state: k.split("|")[0].toUpperCase() }; }
  }
  return best;
}
// A place typed instead of a ZIP ("near Austin, TX", "within 100 miles of Chicago").
export function placeFromText(text) {
  const m = /\b([A-Za-z .'-]{3,40}),\s*([A-Za-z]{2}|[A-Za-z ]{4,20})\b/.exec(String(text || ""));
  return m ? placeCoord(m[1], m[2]) : null;
}
