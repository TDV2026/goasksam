// THE FOUR START PAGES' PLACEHOLDERS, in one place (Sam, Oct 23 2026): every placeholder must be a search the engine answers fully: a
// populated result, no leftover-words line, no question. scripts/placeholderCheck.mjs runs each one through the engine (live, with the probe
// key) and fails when an approved one stops working; a "pending" entry is one Sam has not approved yet or that failed the engine and
// waits for Sam's choice (it is reported, never silently replaced). Sell's placeholder is an invitation, not a search, so it is not run.
export const PLACEHOLDERS = {
  home: { examples: ["A 1965 Chevrolet Corvette within 500 miles of Chicago", "A manual 911 under $80,000", "Low mile E46 M3, no modifications"], via: "find" },
  find: { examples: ["A 1965 Chevrolet Corvette within 500 miles of Chicago", "A manual 911 under $80,000", "Low mile E46 M3, no modifications"], via: "find" },
  mc: { examples: ["1995 Porsche 911 Carrera", "2001 BMW M3, manual", "Or paste a VIN"], via: "marketCheck" },
  sell: { examples: ["2004 Porsche 911 Carrera", "2006 BMW M5", "Or paste a VIN"], via: null }
};
