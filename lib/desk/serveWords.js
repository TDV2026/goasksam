// EVERY ENGINE SENTENCE IS MADE WHEN THE CASE IS SERVED (Lane D, Nov 12 2026; see lib/wordsLedger.js).
// CAUSE of the work: the engine stored its sentences on the case (desk.evidence.sentence, the window lines, the rung lines, the reserve check's short lines, the evidence notes, a comparable's why line ...), so a case read under older wording printed the older words on the panel and in the PDF for good.
// OTHER CARS AND PAGES: every case made before a wording change (the demo and the sample cases, every analyst's open case), on the case panel, in the report's PDF and in what Finalize freezes, and every action answer that carries the case view.
// The case keeps the ledger of its sentences (desk.words: the table id and the figures each was made from). Serving makes each again with the table's current words and puts it where the stored one stood. Figures and decisions are untouched; a sentence the ledger does not hold (a case read before the ledger existed) is shown as stored, and the reserve mode's own figures remake its lines (lib/desk/reserveModeLines.js).
import { reasonLine, WORD_FNS } from "../reasonWords.js";
// the sentences whose words changed: [stored text, current text], the last made first (a sentence is made after the phrases inside it, so it is replaced before them)
export function changedWords(words) {
  const out = [];
  for (const w of (Array.isArray(words) ? words : []).slice().reverse()) {
    let fresh; try { fresh = w.id ? reasonLine(w.id, w.p || {}) : WORD_FNS[w.fn] ? WORD_FNS[w.fn](...(w.a || [])) : null; } catch { fresh = null; }
    if (typeof fresh === "string" && fresh !== w.t) out.push([w.t, fresh]);
  }
  return out;
}
const swap = (s, list) => { for (const [t, f] of list) { if (s === t) s = f; else if (t.length >= 8 && s.includes(t)) s = s.split(t).join(f); } return s; };
const walk = (v, list) => (typeof v === "string" ? swap(v, list) : Array.isArray(v) ? v.map(x => walk(x, list)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "words" ? x : walk(x, list)])) : v);
export function speakDesk(desk) {
  if (!desk || typeof desk !== "object" || !Array.isArray(desk.words) || !desk.words.length) return desk;
  const list = changedWords(desk.words); return list.length ? walk(desk, list) : desk;
}
