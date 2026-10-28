// The invariant for one answer's option groups (e100): the headline options add up to the headline count or a remainder says how many sales they leave out; options over the count carry the
// engine's note; no pill (dimension and value) is listed twice across options and refineOptions. Used by scripts/optionsAddUpCheck.mjs and the ops task optionssweep.
export function optionProblems(a) {
  const out = [], opts = Array.isArray(a && a.options) ? a.options : [], total = Number(a && a.poolN);
  if (opts.length >= 2 && Number.isFinite(total)) {
    const sum = opts.reduce((t, o) => t + (Number(o.n) || 0), 0), rem = a.optionsRemainder && Number(a.optionsRemainder.n) || 0;
    if (sum < total && sum + rem !== total) out.push(`options add to ${sum}, footer ${total}, remainder ${rem || "not shown"}`);
    if (sum > total && !a.optionsNote && !opts.some(o => o.windowLonger)) out.push(`options add to ${sum}, over the footer ${total}, no note`);
  }
  // a pill twice inside one list is always a fault; the same pill in options and in refineOptions is the engine's one allowed repeat, and only when refineOptions marks it ofOptions
  const lists = [a && a.options || [], a && a.refineOptions || []];
  lists.forEach(list => { const seen = new Set(); for (const o of list) { const k = o.dimension + "|" + o.value; if (seen.has(k)) out.push(`pill ${o.label} (${o.dimension}) appears twice`); seen.add(k); } });
  const optKeys = new Set(lists[0].map(o => o.dimension + "|" + o.value)); for (const o of lists[1]) if (optKeys.has(o.dimension + "|" + o.value) && !o.ofOptions) out.push(`pill ${o.label} (${o.dimension}) is in options and in refineOptions, not marked ofOptions`);
  return out;
}
