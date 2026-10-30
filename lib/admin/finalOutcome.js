// A SEARCH COUNTS AS UNMET OR FAILED BY ITS FINAL OUTCOME ONLY (Sam's ruling, Oct 30 2026). A first ask can end "failed" with failure_state
// still_reading ("The sales for this one are being read") and the reader is then answered on a later poll; the page asks again on the engine's
// own retryAfterMs, and each ask writes its own search_run. The failed row stays in the log (it is the timing of the read), but it is not a
// failure and not unmet demand when a LATER search_run for the SAME search answered.
// Same search: the same search_id when both rows carry one; otherwise the same visitor (anon id, else session id), the same product and the
// same query text (case and spacing aside). A row with no visitor and no search_id cannot be tied to a later one, so it stays counted.
// Pure: events in, the set of failed events that were answered later out. Nothing here reads the database or computes a market figure.
const norm = s => String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
const who = e => e.anon_id || e.session_id || null;
function keysOf(e) {
  const p = e.props || {}, out = [];
  if (p.search_id) out.push("id|" + e.product + "|" + p.search_id);
  const w = who(e), q = norm(p.query_text);
  if (w && q && q !== "-") out.push("q|" + w + "|" + e.product + "|" + q);
  return out;
}
export function answeredLater(runs) {
  const latest = new Map();   // key -> newest answering ts
  for (const e of runs) { if ((e.props || {}).answer_type === "failed") continue; for (const k of keysOf(e)) { const t = latest.get(k); if (!t || e.ts > t) latest.set(k, e.ts); } }
  const gone = new Set();
  for (const e of runs) { if ((e.props || {}).answer_type !== "failed") continue; if (keysOf(e).some(k => latest.has(k) && latest.get(k) > e.ts)) gone.add(e); }
  return gone;
}
// The runs a count should use: every search_run except a failed one that a later ask for the same search answered.
export const finalRuns = runs => { const g = answeredLater(runs); return g.size ? runs.filter(e => !g.has(e)) : runs; };
