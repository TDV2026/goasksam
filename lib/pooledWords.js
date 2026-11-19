// The line to print for an engine answer's thin line: the engine's own, verbatim (e96: the page-written "These sell in different price ranges" sentence is retired; the
// options print as the engine's headlineLines and optionLines, lib/sellsForCard.js). Kept as the one reader so no surface reads d.thinLine its own way.
export const thinLineOf = d => (d && d.thinLine) || null;
