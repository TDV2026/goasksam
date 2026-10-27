// The one sentence for options that sell in different price ranges (Sam, Oct 27 2026, until the plain wording job rewrites every reason line as a class). It stands where the
// engine's own thin line used to stand when no one range is shown, on Market Check, Sell, Find, the cards, the history page and the MCP tool. lib/sellsForCard.js carries a copy
// (it runs in the browser as one self-contained function); scripts/pooledStatesCheck.mjs fails if the copies differ.
export const POOLED_APART_LINE = "These sell in different price ranges, so one range would mislead.";
// The line to print for an engine answer's thin line: the plain sentence when the options price apart, the engine's own line otherwise.
export const thinLineOf = d => (d && (d.pooledApart || d.thinReason === "pooled_apart") ? POOLED_APART_LINE : (d && d.thinLine) || null);
