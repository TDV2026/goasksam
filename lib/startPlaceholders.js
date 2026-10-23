// THE FOUR START PAGES' PLACEHOLDERS, in one place (Sam, Oct 23 2026): every placeholder must be a search the engine answers fully: a
// populated result, no leftover-words line, no question. scripts/placeholderCheck.mjs runs each one through the engine (live, with the probe
// key) and fails when an approved one stops working; a "pending" entry is one Sam has not approved yet or that failed the engine and
// waits for Sam's choice (it is reported, never silently replaced). Sell's placeholder is an invitation, not a search, so it is not run.
export const PLACEHOLDERS = {
  home: { examples: ["A 1965 Chevrolet Corvette within 500 miles of Chicago..."], via: "find" },
  find: { text: "Find me a 1995 Land Rover Defender under $100k...", via: "find" },
  mc: { text: "1995 Porsche 911 Carrera", via: "marketCheck" },
  sell: { text: "Type your car, or paste a VIN.", via: null }
};
