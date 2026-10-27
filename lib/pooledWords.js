// The one sentence for options that sell in different price ranges (Sam, Oct 27 2026, until the plain wording job rewrites every reason line as a class). It stands where the
// engine's own thin line used to stand when no one range is shown, on Market Check, Sell, Find, the cards, the history page and the MCP tool. lib/sellsForCard.js carries a copy
// (it runs in the browser as one self-contained function); scripts/pooledStatesCheck.mjs fails if the copies differ.
export const POOLED_APART_LINE = "These sell in different price ranges, so one range would mislead.";
// The line to print for an engine answer's thin line: the plain sentence when the options price apart, the engine's own line otherwise.
export const thinLineOf = d => (d && (d.pooledApart || d.thinReason === "pooled_apart") ? POOLED_APART_LINE : (d && d.thinLine) || null);

// The engine's own window words for one option of the pooled lines (windowNote when windowLonger), looked up on the option, else on the same option in the answer's own option lists.
// The same lookup is carried by public/js/onebox.js and lib/sellsForCard.js (pooledNoteOf); scripts/pooledStatesCheck.mjs compares all of them.
export function pooledNoteOf(d, o) {
  // the engine's own words for an option that reads a longer window than the bare page ("Based on 13 sales over the last 24 months."): on the option itself, else on the same option in the answer's own option lists
  if (o.windowLonger === true && o.windowNote) return String(o.windowNote);
  var lists = [];
  if (o.dimension === "body") lists.push(d.bodyOptions);
  if (o.dimension === "edition") (Array.isArray(d.variantOptionsLine) ? d.variantOptionsLine : []).forEach(function (e) { if (e && e.key !== "restoration") lists.push(e.options); });
  if (o.dimension === "gearbox") (Array.isArray(d.inlineSplits) ? d.inlineSplits : []).forEach(function (e) { if (e && e.key === "gearbox" && Array.isArray(e.sides)) lists.push(e.sides.map(function (s) { return { value: /manual/i.test(String(s.label || "")) ? "manual" : "auto", windowLonger: s.windowLonger, windowNote: s.windowNote }; })); });
  for (var i = 0; i < lists.length; i++) for (var j = 0; Array.isArray(lists[i]) && j < lists[i].length; j++) { var e = lists[i][j]; if (e && String(e.value) === String(o.value) && e.windowLonger === true && e.windowNote) return String(e.windowNote); }
  return "";
}

// The pooled fields as the shared card gets them: every option carries its own window words (windowLonger, windowNote) when the answer's option lists say it reads a longer window, so
// the card, which gets only the card fields, never loses them (scripts/pooledStatesCheck.mjs).
export function pooledWithNotes(d) {
  const out = {};
  for (const k of ["pooledApart", "pooledSplit"]) {
    const src = d && d[k]; if (!src || !Array.isArray(src.options)) continue;
    out[k] = { ...src, options: src.options.map(o => { const note = pooledNoteOf(d, o); return note ? { ...o, windowLonger: true, windowNote: note } : o; }) };
  }
  return out;
}
