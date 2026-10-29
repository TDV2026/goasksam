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
