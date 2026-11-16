// A DESK ANSWER THAT DID NOT COMPLETE IS NEVER THE CASE'S ANSWER (Lane D, Nov 16 2026; Sam's 2006 Porsche 911, VIN WP0AA29966S715747, created in the Hagerty org: the stored answer had 0 sales in every period and no period views, and 15 comparables; the engine's fresh read of the same car gave 24 sales and 30 comparables).
// CAUSE: the pool read behind the sales came back empty (the engine's empty-result-under-load gap) while the comparables read answered, and the engine's answer was not marked as a retry, so the Desk stored it as the case's market and showed "too few sales".
// RULE (Nov 16 2026, widened by Sam's order): an answer is incomplete when it is a retry, has no desk, carries a failure marker, has an evidence count of 0 with any comparables, or carries no period view at all (the Desk always asks for the views, so an answer without them did not finish). An incomplete answer is never stored as the case's answer, whichever road read it (case_new, a forwarded lead, the email re-read, the shape re-read, an edit); the case keeps its earlier good answer or none, says "The market read did not complete. Retry.", and the analyst's Retry (case_reread_market) reads again. Pure: it reads the answer's own fields and computes no market figure.
// A marker the engine may set (Lane B): desk.partial, desk.incomplete, desk.failed, desk.error, desk.readHealth.complete false, or the same on the answer itself. Any of them is read here as not complete.
export const VIEWS_FROM_SHAPE = 6;
export const incompleteWhy = a => {
  if (!a || a.retry) return "retry";
  const d = a.desk; if (!d) return "none";
  if (d.partial === true || d.incomplete === true || d.failed === true || d.error || a.partial === true || a.incomplete === true || a.error || (d.readHealth && d.readHealth.complete === false)) return "marked";
  const views = d.views && typeof d.views === "object" ? Object.keys(d.views).length : 0, comps = Array.isArray(d.comparables) ? d.comparables.length : 0, count = d.evidence && Number.isFinite(Number(d.evidence.count)) ? Number(d.evidence.count) : null;
  const current = Number(d.shape) >= VIEWS_FROM_SHAPE;   // an answer recorded before the shape and the period views existed (the recorded reads of Nov 11 2026) has no shape and is not judged by these two
  if (current && count === 0 && comps > 0) return "empty_pool";   // a count of 0 with comparables listed: the pool read behind the sales came back empty while the comparables answered (the 2006 911, 4254dc24: 0 sales, 15 comparables; the fresh read gave 24 sales and 30)
  if (current && !views) return "no_views";   // no period view at all: the Desk always asks for the views, so an answer without them did not finish
  return null;
};
export const answerComplete = a => incompleteWhy(a) === null;
// a stored case's answer, read the same way (the 911 above is flagged by it: no views, 15 comparables)
export const storedAnswerWhy = c => (c && c.desk && c.desk.evidence ? incompleteWhy({ desk: c.desk }) : null);
