// BID WORDING VERIFIER (e100). Reads a finished card (its market object and its Sam lines) and says where a sentence about the bid disagrees with the figures it is printed beside.
// It does not trust the engine's own fields: the pair a sentence is judged against is read from what the card SHOWS (the range, the leading option's range, the sales near its miles,
// the span of the sales counted), and the word in the sentence is compared with the bid against that pair. Used by scripts/bidPlaceCheck.mjs (fixtures) and the ops task bidplace (stored cores).
const SENT = /\bThe bid is (below|inside|within|above)\b([^.]*)\./g;
const toNum = s => Number(String(s).replace(/,/g, ""));
const pairIn = s => { const m = /\$([\d,]+)\s+to\s+\$([\d,]+)/.exec(String(s || "")); return m ? [toNum(m[1]), toNum(m[2])] : null; };
const againstOf = (bid, [lo, hi]) => bid < lo ? "below" : bid > hi ? "above" : "within";
// the pair the card's large figure shows, in the order the card prints: the engine's Find range, the range, the leading option, the span of the sales counted
export function shownPair(m) {
  if (!m) return null;
  if (m.findAnswer && m.findAnswer.range) return { pair: [Number(m.findAnswer.range.low), Number(m.findAnswer.range.high)], what: "findAnswer.range" };
  if (m.kind === "range" && m.low > 0 && m.high > 0) return { pair: [Number(m.low), Number(m.high)], what: "range" };
  if ((m.optionsState === "split" || m.optionsState === "apart") && Array.isArray(m.optionLines) && m.optionLines.length) {
    const lead = (typeof m.matchedOption === "string" ? m.matchedOption : m.matchedOption && m.matchedOption.label) ? (m.optionLines.find(x => String(x).startsWith(String(typeof m.matchedOption === "string" ? m.matchedOption : m.matchedOption.label) + " ")) || m.optionLines[0]) : m.optionLines[0];
    const p = pairIn(lead); return p ? { pair: p, what: "leading option" } : null;
  }
  if (Array.isArray(m.saleSpan) && m.saleSpan.length === 2 && m.saleSpan[0] > 0) return { pair: [Number(m.saleSpan[0]), Number(m.saleSpan[1])], what: "sales span" };
  return null;
}
// every problem on one card for one bid (dollars): a bid sentence whose word disagrees with the bid against the pair it sits beside, a sentence with no pair to judge, or a placing field that says otherwise
export function bidWordProblems(l, bid) {
  const out = [], m = l && l.market; if (!m) return out;
  const head = shownPair(m);
  const check = (src, text, pair, what) => {
    if (!text) return;
    for (const s of String(text).matchAll(SENT)) {
      if (!pair) { out.push(`${src}: "${s[0]}" has no printed pair to judge`); continue; }
      const want = againstOf(bid, pair), said = s[1] === "inside" ? "within" : s[1];
      if (said !== want) out.push(`${src}: says ${s[1]} but $${bid} is ${want} ${what} $${pair[0]} to $${pair[1]}`);
    }
  };
  for (const e of (l.sam_lines || [])) {
    if (e.kind !== "range") continue;
    check("sam line text", e.text, head && head.pair, head && head.what);
    check("sam line bidLine", e.bidLine, head && head.pair, head && head.what);
    if (e.placing) { const w = String(e.placing).replace(/ the range$/, ""), want = head ? againstOf(bid, head.pair) : null; if (!head || (w === "inside" ? "within" : w) !== want) out.push(`placing field "${e.placing}" does not match ${head ? head.what + " $" + head.pair[0] + " to $" + head.pair[1] : "any printed pair"}`); }
    if (e.bidPlace && head) { const bp = e.bidPlace; if (bp.against !== againstOf(bid, [bp.low, bp.high])) out.push(`bidPlace says ${bp.against} against its own pair $${bp.low} to $${bp.high}`); }
    for (const t of (e.lines || [])) check("findAnswer line", t, head && head.pair, head && head.what);
  }
  const mn = m.mileageNear;
  if (mn && mn.bidLine) check("mileageNear.bidLine", mn.bidLine, [mn.low, mn.high], "the sales near its miles");
  return out;
}
export const BID_GRID = r => { const [lo, hi] = r; return [lo - 1, lo, Math.round((lo + hi) / 2), hi, hi + 1].filter(x => x > 0); };
