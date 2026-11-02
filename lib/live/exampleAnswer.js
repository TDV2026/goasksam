// THE ENGINE'S ANSWER, STORED AS IT IS (Lane B, Oct 29 2026). A landing example (Market Check's band, the Desk page's worked example) is one fixed car run through the one engine; what is stored
// is that answer's own fields and nothing a builder decides: no cluster rule, no sales floor, no generation floor of its own. A car the engine answers with a split or apart state (cluster
// null, the options as lines) is stored as that state, so the example shows the same range, the same count and the same lines as Market Check for the same car. The only gate is the engine's
// own: a stored example needs tier "result". scripts/exampleFromEngineCheck.mjs holds every builder to this.
const PASS = ["tier", "optionsState", "headlineDimension", "headlineLines", "optionLines", "options", "refineOptions", "optionsRemainder", "pooledApart", "cluster", "span", "poolN", "soldCount", "soldCountN",
  "windowLabel", "windowWords", "windowLine", "freshness", "referenceFigure", "yoyDirection", "rangeLabel", "rungLabel", "fallbackRung"];
export function engineFieldsOf(d) {
  if (!d || typeof d !== "object" || d.tier !== "result") return null;
  const out = {};
  for (const k of PASS) if (d[k] !== undefined) out[k] = d[k];
  if (out.cluster === undefined) out.cluster = null;
  return out;
}
export function cardsOf(d, n, keys) {
  const cards = Array.isArray(d && d.cards) ? d.cards.filter(c => Number(c.price) > 0) : [];
  return cards.slice(0, n).map(c => { const o = {}; for (const k of keys) o[k] = c[k] === undefined ? null : c[k]; return o; });
}

// THE BUILD LOG'S ONE LINE FOR A STORED EXAMPLE (Lane B, Nov 2 2026; the nightly run #128 crashed on "d.cluster[0]" because the 2008 Carrera S answers apart: Coupe and Cabriolet price apart, cluster null). A log line reads the stored example's own fields and
// never assumes a single range: a cluster is "range low-high"; a null cluster with options is each option's own range from the engine (label, low, high); a null cluster with only the engine's option lines prints those; anything else says no range.
// It never invents a figure and never throws, so a cosmetic log line can not turn a good build red.
export function rangeWords(d) {
  try {
    if (d && Array.isArray(d.cluster) && d.cluster.length === 2) return `range ${d.cluster[0]}-${d.cluster[1]}`;
    const opts = d && Array.isArray(d.options) ? d.options.filter(o => o && o.label && Number.isFinite(Number(o.low)) && Number.isFinite(Number(o.high))) : [];
    if (opts.length) return "no single range, each option's own: " + opts.map(o => `${o.label} ${o.low}-${o.high}`).join(", ");
    const lines = d && Array.isArray(d.optionLines) ? d.optionLines.filter(x => typeof x === "string" && x) : [];
    if (lines.length) return "no single range, the engine's lines: " + lines.join("; ");
  } catch { /* a log line never fails a build */ }
  return "no range";
}
export const salesWords = d => `${d && Array.isArray(d.cards) ? d.cards.length : 0} sales cached`;
