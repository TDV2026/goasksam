// THE FOUR START PAGES' PLACEHOLDERS, in one place (Sam, Oct 23 2026): every placeholder must be a search the engine answers fully: a
// populated result, no leftover-words line, no question. scripts/placeholderCheck.mjs runs each one through the engine (live, with the probe
// key) and fails when an approved one stops working; a "pending" entry is one Sam has not approved yet or that failed the engine and
// waits for Sam's choice (it is reported, never silently replaced). Sell's placeholder is an invitation, not a search, so it is not run.
export const PLACEHOLDERS = {
  home: { examples: ["Find me a red manual Porsche 911 from the 1990s, preferably under $100k...", "A clean E30 M3 within 300 miles of Chicago...", "Any Land Cruiser FJ40 ending this week...", "A low-mileage Mustang GT350 with no reserve..."], via: "find", pending: "Sam's candidate 'A manual E30 M3 within 300 miles of Chicago' failed the engine (no live car, and the leftover-words line names e30, within, chicago); the current four also fail (leftover words)" },
  find: { text: "Find me a manual Ferrari 575M under $200k...", via: "find", pending: "Sam's candidate 'A low-mileage Mustang GT350 with no reserve' failed the engine (leftover words low-mileage and reserve, and two questions); the current one finds no live car" },
  mc: { text: "1995 Porsche 911 Carrera", via: "marketCheck" },
  sell: { text: "Type your car, or paste a VIN.", via: null }
};
