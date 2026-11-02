// Read-failure scope (Lane B, Nov 2 2026, job lane-b-archiveread, step a).
//
// THE CAUSE this closes. An archive read that fails (a statement timeout 57014, a throttle, an abort) comes back from the Supabase helpers
// as null. The engine turned it into an empty list at ~20 sites ("(await supabaseSelect(...)) || []"), so a failed leg read as FEWER
// SALES. Only one case was caught (the whole pool empty: diag.queryError plus thin.totalN === 0 became read_failed). A pool with one of
// its three legs (model, title, chassis alias) or one page missing, or an enrichment read dropped, was built, counted, stored and served as
// a finished answer. A failed read must be reported as a failure, never counted as fewer rows.
//
// THE MECHANISM. One AsyncLocalStorage store per request (the same pattern as the engine's OB_CLOCK), so a failure noted anywhere under
// an answer reaches the gate at that answer's edge, however many reads, throwaway diag objects or Promise.all legs lie between. A read
// that fails calls noteReadFailure(label); the gate (lib/onebox.js gateReadFailures) turns an answer built under any noted failure into
// tier read_failed, which oneEngineAnswer retries once and then answers as "still reading", and which answerCacheable never stores.
//
// readScoped(fn) JOINS an outer scope when there is one (a nested runOneBox shares its request's failures) and reports the failures
// noted since it began; with no outer scope it opens its own. isolatedReadScope(fn) opens a NEW scope that an outer one never sees
// (an optional extra line read beside the answer: its failure omits that line, it never fails the answer).
import { AsyncLocalStorage } from "node:async_hooks";

const SCOPE = new AsyncLocalStorage();

export function noteReadFailure(label) {
  const s = SCOPE.getStore();
  const text = String(label || "archive read");
  if (s) s.failed.push(text);
  console.error(`::error::archive read failed (${text}); an answer built under it is not served or stored as finished`);
}

// An empty list for a failed read, the failure noted. Use in place of "(await read) || []".
export function okRows(rows, label) {
  if (rows === null || rows === undefined) { noteReadFailure(label); return []; }
  return rows;
}

export async function readScoped(fn) {
  const cur = SCOPE.getStore();
  if (cur) {
    const from = cur.failed.length;
    const value = await fn();
    return { value, failed: cur.failed.slice(from) };
  }
  const s = { failed: [] };
  return SCOPE.run(s, async () => {
    const value = await fn();
    return { value, failed: s.failed.slice() };
  });
}

export function isolatedReadScope(fn) {
  return SCOPE.run({ failed: [] }, fn);
}

export function readFailuresNow() {
  const s = SCOPE.getStore();
  return s ? s.failed.slice() : [];
}

// For a builder that runs OUTSIDE any answer scope (a spec page, a desk measure, a nightly cache): a failed read throws, so the build keeps what it
// stored and counts a failure, never builds from "no rows". (Inside an answer, use okRows: the scope gates the answer.)
export function mustRows(rows, label) {
  if (rows === null || rows === undefined) { noteReadFailure(label); throw new Error(`archive read failed: ${label || "read"}`); }
  return rows;
}
