// ZERO-LIVE SEARCH TURN CHECK (Lane E, Oct 19 2026): the Buy surface's endAfterTools hook (lib/live/samChat.js, the real
// object, no copy) on fixed traces, no network, no model, no database. A search with nothing live ends with the code's
// no-cars sentence, also when the model read a market by name in the same turn (the 1937 Bugatti case), while a turn
// with live cars, a card's own market read or a car's history keeps its path. Exits 1 on any case that breaks.
//   node scripts/buyEmptyGuardCheck.mjs
import { BUY, zeroLiveSearchTurn } from "../lib/live/samChat.js";

const EMPTY = "Nothing live matches 1937 Bugatti Type 57SC Atlantics right now.";
const LINE = "Here's what's for sale: Porsche 911s.";
const s = { tool: "search_live", input: { make: "Bugatti" }, result: { cards: [] } };
const mByName = { tool: "market_check", input: { car: "1937 Bugatti Type 57SC Atlantic" }, result: { reason: "Too few sales." } };
const mCard = { tool: "market_check", input: { listing_id: 123 }, result: {} };
const hist = { tool: "car_history", input: { listing_id: 123 }, result: {} };
const empty = { emptyLine: EMPTY, searchLine: null }, live = { emptyLine: null, searchLine: LINE };
const cases = [
  ["zero live, search only: the no-cars sentence", [s], empty, EMPTY],
  ["zero live, search + market by name (the Bugatti case): the no-cars sentence", [s, mByName], empty, EMPTY],
  ["zero live, market by name before the search: the no-cars sentence", [mByName, s], empty, EMPTY],
  ["zero live, search + a card's market read: keeps its path", [s, mCard], empty, null],
  ["zero live, search + a car history: keeps its path", [s, hist], empty, null],
  ["zero live, market by name with no search: keeps its path", [mByName], empty, null],
  ["live cars, search only: the for-sale line", [s], live, LINE],
  ["live cars, search + market by name: keeps the model reply path", [s, mByName], live, null],
  ["no search facts at all: keeps its path", [s, mByName], { emptyLine: null, searchLine: null }, null],
];
let failed = 0;
for (const [name, trace, ctx, want] of cases) {
  const got = BUY.endAfterTools(trace, ctx);
  const ok = got === want; if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
}
if (zeroLiveSearchTurn(null, empty) !== false || zeroLiveSearchTurn([], empty) !== false) { failed++; console.log("FAIL  empty trace must not end the turn"); }
console.log(failed ? `buyEmptyGuardCheck: ${failed} FAIL` : "buyEmptyGuardCheck: all pass");
process.exit(failed ? 1 : 0);
