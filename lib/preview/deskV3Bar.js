// THE MARKET POSITION BAR (Lane E, Nov 8 2026). DRAWING ONLY: it puts marks on a line at the places the figures sit between the lowest and highest of the figures it was given. The figures printed on the bar are the
// ones the engine and the case sent (market.meter, the analyst's range, the reserve, the asking price); nothing here makes a figure, only a position. deskV3WireCheck holds the printed labels to the sent fields.
import { moneyWords } from "../reasonWords.js";
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ok = v => Number.isFinite(Number(v)) && v !== null && v !== "";
export function barHtml(meter, a) {
  if (!meter || ![meter.low, meter.p25, meter.median, meter.p75, meter.high].every(ok)) return "";
  const pts = [meter.low, meter.high, ...(a ? [a.low, a.high, a.reserve, a.asking].filter(ok) : [])].map(Number), lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1, at = v => ((Number(v) - lo) / span * 100).toFixed(2) + "%";
  const q = [["lowest", meter.low], ["q1", meter.p25], ["median", meter.median], ["q3", meter.p75], ["highest", meter.high]];
  const marks = q.map(([k, v], i) => `<span class="mk mk-q mk-${k}" style="left:${at(v)}" data-v="${esc(v)}"><i></i><b>${esc(k)}</b><em>${esc(moneyWords(v))}</em></span>`).join("");
  const own = !a ? "" : [ok(a.reserve) ? `<span class="mk mk-res" style="left:${at(a.reserve)}" data-v="${esc(a.reserve)}"><i></i><b>reserve</b><em>${esc(moneyWords(a.reserve))}</em></span>` : "", ok(a.asking) ? `<span class="mk mk-ask" style="left:${at(a.asking)}" data-v="${esc(a.asking)}"><i></i><b>asking</b><em>${esc(moneyWords(a.asking))}</em></span>` : ""].join("");
  const range = a && ok(a.low) && ok(a.high) ? `<span class="rng" style="left:${at(a.low)};width:${((Number(a.high) - Number(a.low)) / span * 100).toFixed(2)}%" title="Assessed range"></span>` : "";
  return `<div class="bar3" role="img" aria-label="Market position"><div class="bar3-line"><span class="iqr" style="left:${at(meter.p25)};width:${((meter.p75 - meter.p25) / span * 100).toFixed(2)}%"></span>${range}</div>${marks}${own}</div>`;
}
