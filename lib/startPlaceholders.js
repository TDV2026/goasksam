// THE FOUR START PAGES' PLACEHOLDERS, in one place (Sam, Oct 23 2026): every placeholder must be a search the engine answers fully: a
// populated result, no leftover-words line, no question. scripts/placeholderCheck.mjs runs each one through the engine (live, with the probe
// key) and fails when an approved one stops working; a "pending" entry is one Sam has not approved yet or that failed the engine and
// waits for Sam's choice (it is reported, never silently replaced). Sell's placeholder is an invitation, not a search, so it is not run.
export const PLACEHOLDERS = {
  home: { examples: ["A Corvette near Chicago", "A manual 911 under $40,000", "Low mile E46 M3, no modifications"], via: "find" },
  find: { examples: ["A Corvette near Chicago", "A manual 911 under $40,000", "Low mile E46 M3, no modifications"], via: "find" },
  // the three short pills on the crew previews /preview/home and /preview/find (Sam's correction brief, Nov 4 2026; reworded Nov 5 after the live run: $80k gave 32 cars and the question panel, 1965 near Chicago gave none); run through the engine by placeholderCheck --live like every entry here
  preview: { examples: ["Manual 911 under $40k", "E46 M3 with low miles", "Corvette near Chicago"], via: "find" },
  mc: { examples: ["1995 Porsche 911 Carrera", "2001 BMW M3, manual", "Or paste a VIN"], via: "marketCheck" },
  sell: { examples: ["2004 Porsche 911 Carrera", "2006 BMW M5", "Or paste a VIN"], via: null }
};

// WHAT A PILL MAY DO (Sam, Nov 5 2026): a placeholder or pill is a promise that the tap gives cards. So the engine's answer to it must be
// cards, for the car it names, with no question of any kind. This is the one verdict scripts/placeholderCheck.mjs applies to every entry above
// (live) and proves offline against captured engine answers. r: { cards, unused, asks, narrow, zip, line, note } from the engine's own reply.
//   - no cards at all (the car is not on sale where the pill says);
//   - cards for something else (the engine widened: "No 1965 Corvettes are live right now ... the nearest, 1964 and 1966");
//   - leftover words (the engine could not read part of it);
//   - a question: the narrowing panel (narrow "question", 25 or more cars), a zip question, or any reply line that asks.
// The light (9 to 24 cars) and quiet (3 to 8) refinements are suggestions, not questions, and pass.
export function pillProblem(r) {
  const why = [];
  if (!r || !(r.cards > 0)) why.push("returns no cards");
  if (r && r.note && /\bare live right now\b|\bnearest\b/i.test(r.note)) why.push("returns cards for another car or year than it names (" + r.note + ")");
  if (r && r.unused) why.push("leaves words unread (" + r.unused + ")");
  if (r && (r.narrow === "question" || (r.asks > 0 && r.narrow !== "light" && r.narrow !== "quiet"))) why.push("asks " + (r.asks || 1) + " narrowing question(s)");
  if (r && (r.zip || /\?\s*$/.test(String(r.line || "")))) why.push("asks a question (" + (r.line || "zip") + ")");
  return why;
}
