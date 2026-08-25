// Shared US Census Bureau 4-region map. Used by the admin dashboard (Region column /
// rollup) AND the PowerSeller ranking (region-bucket proximity tiebreak), so both speak
// one definition. A location may be a full state name, a 2-letter abbreviation, or a
// coarse region name (e.g. "Mountain West", "New England"); non-US / unknown -> "".
export const CENSUS_REGIONS = ["Northeast", "Midwest", "South", "West"];

const STATE = (() => {
  const R = {
    Northeast: ["Maine", "New Hampshire", "Vermont", "Massachusetts", "Rhode Island", "Connecticut", "New York", "New Jersey", "Pennsylvania"],
    Midwest: ["Ohio", "Michigan", "Indiana", "Illinois", "Wisconsin", "Minnesota", "Iowa", "Missouri", "North Dakota", "South Dakota", "Nebraska", "Kansas"],
    South: ["Delaware", "Maryland", "District of Columbia", "Washington DC", "Virginia", "West Virginia", "North Carolina", "South Carolina", "Georgia", "Florida", "Kentucky", "Tennessee", "Alabama", "Mississippi", "Arkansas", "Louisiana", "Oklahoma", "Texas"],
    West: ["Montana", "Idaho", "Wyoming", "Colorado", "New Mexico", "Arizona", "Utah", "Nevada", "Washington", "Oregon", "California", "Alaska", "Hawaii"]
  };
  const ABBR = {
    Northeast: ["ME", "NH", "VT", "MA", "RI", "CT", "NY", "NJ", "PA"],
    Midwest: ["OH", "MI", "IN", "IL", "WI", "MN", "IA", "MO", "ND", "SD", "NE", "KS"],
    South: ["DE", "MD", "DC", "VA", "WV", "NC", "SC", "GA", "FL", "KY", "TN", "AL", "MS", "AR", "LA", "OK", "TX"],
    West: ["MT", "ID", "WY", "CO", "NM", "AZ", "UT", "NV", "WA", "OR", "CA", "AK", "HI"]
  };
  const m = new Map();
  for (const [region, names] of Object.entries(R)) for (const n of names) m.set(n.toLowerCase(), region);
  for (const [region, abbrs] of Object.entries(ABBR)) for (const a of abbrs) if (!m.has(a.toLowerCase())) m.set(a.toLowerCase(), region);
  return m;
})();

// Coarse region-name aliases (unambiguous only). "East Coast" and "Mid-Atlantic" straddle
// Northeast/South, and "Nationwide"/"International" are not a region, so they resolve to "".
const REGION_ALIASES = new Map([
  ["northeast", "Northeast"], ["new england", "Northeast"],
  ["midwest", "Midwest"], ["mid-west", "Midwest"], ["great lakes", "Midwest"],
  ["south", "South"], ["southeast", "South"], ["southern", "South"], ["deep south", "South"], ["gulf", "South"],
  ["west", "West"], ["west coast", "West"], ["pacific", "West"], ["pacific northwest", "West"], ["mountain", "West"], ["mountain west", "West"], ["southwest", "West"]
]);

export function censusRegion(loc) {
  const s = String(loc == null ? "" : loc).trim().toLowerCase();
  if (!s) return "";
  return STATE.get(s) || REGION_ALIASES.get(s) || "";
}

// The set of Census regions a partner explicitly covers. "Nationwide"/"International" are
// deliberately EXCLUDED: broad coverage keeps a partner ELIGIBLE (regionMet) but earns no
// regional-proximity credit, so it never ties out a genuinely closer partner.
export function partnerRegionBuckets(regions) {
  const set = new Set();
  for (const r of regions || []) {
    const s = String(r).toLowerCase().trim();
    if (s === "nationwide" || s === "international") continue;
    const b = censusRegion(r);
    if (b) set.add(b);
  }
  return set;
}
