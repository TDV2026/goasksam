// The invariant for one answer's option groups (e100): a group of options either adds up to the headline count (or a remainder says how many sales it leaves out), or EVERY option read over a window other than
// the footer's prints its own count and since date on its line ("11 sales since March 2025"); an option whose window differs prints it even when the counts happen to add up; no pill (dimension and value) is
// listed twice in one list, and a repeat across options and refineOptions is allowed only when refineOptions marks it ofOptions. Anything else fails. Used by scripts/optionsAddUpCheck.mjs and the ops task optionssweep.
export function optionProblems(a) {
  const out = [], opts = Array.isArray(a && a.options) ? a.options : [], total = Number(a && a.poolN), footer = (a && a.windowWords) || null;
  const lines = Array.isArray(a && a.optionLines) ? a.optionLines : [];
  const own = o => /^since /.test(String(o.windowWords || "")) && o.windowWords !== footer;       // an option read over a window other than the footer's
  const prints = o => lines.some(l => String(l).includes(String(o.label)) && String(l).includes(String(o.windowWords)));   // ... and its line says so
  // an option that reaches back more than 24 months prints neither a range nor a since date (the reach cap): read the option's window the way the engine does
  const MON = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const reach = o => { const w = Number(o.windowMonths); if (Number.isFinite(w) && w > 0) return w; const m = /^since (\w+) (\d{4})/i.exec(String(o.windowWords || "")); const i = m ? MON.indexOf(m[1].toLowerCase()) : -1; return i < 0 ? null : Math.round((Date.now() - Date.UTC(Number(m[2]), i, 1)) / (30.4 * 864e5)); };
  for (const o of opts) { const r = o.ownWindow ? reach(o) : null; if (r != null && r > 24 && !(o.rangeFloor && o.windowCapped)) out.push(`option ${o.label} reaches ${r} months back and prints ${o.rangeFloor ? "its own since date" : "a range"}, past the 24 month cap`); }
  if (opts.length >= 2 && Number.isFinite(total)) {
    const sum = opts.reduce((t, o) => t + (Number(o.n) || 0), 0), rem = a.optionsRemainder && Number(a.optionsRemainder.n) || 0;
    const differing = opts.filter(own), unprinted = differing.filter(o => !prints(o));
    if (unprinted.length) out.push(`option ${unprinted.map(o => o.label).join(", ")} is read over its own window (${unprinted[0].windowWords}) and its line does not say so`);
    if (sum !== total) {
      const explainedByRemainder = sum < total && sum + rem === total;
      const explainedByWindows = differing.length > 0 && unprinted.length === 0;
      if (!explainedByRemainder && !explainedByWindows) out.push(`options add to ${sum}, footer ${total}: no remainder and no option prints its own window`);
    }
  }
  const lists = [a && a.options || [], a && a.refineOptions || []];
  lists.forEach(list => { const seen = new Set(); for (const o of list) { const k = o.dimension + "|" + o.value; if (seen.has(k)) out.push(`pill ${o.label} (${o.dimension}) appears twice`); seen.add(k); } });
  const optKeys = new Set(lists[0].map(o => o.dimension + "|" + o.value)); for (const o of lists[1]) if (optKeys.has(o.dimension + "|" + o.value) && !o.ofOptions) out.push(`pill ${o.label} (${o.dimension}) is in options and in refineOptions, not marked ofOptions`);
  return out;
}
