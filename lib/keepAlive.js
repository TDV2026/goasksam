// KEEP A COMPUTE ALIVE PAST ITS RESPONSE (Sam, Oct 28 2026, no dead ends on a cold spec). A serverless function may be stopped the moment it has answered, so
// a compute that lost its race with a page's clock used to be dropped and the next ask started from nothing, and a spec that needs longer than the clock could never
// be stored. keepAlive hands the promise to Vercel's waitUntil (read from the request context, the way the stale-row recompute in api/sellerDecision.js does) so
// the work finishes and writes its row. Returns true when the platform took it; false (local runs, tests) leaves the promise running in the process.
export function keepAlive(p) {
  const safe = Promise.resolve(p).catch(() => {});
  try {
    const ctx = globalThis[Symbol.for("@vercel/request-context")];
    const got = ctx && typeof ctx.get === "function" ? ctx.get() : null;
    if (got && typeof got.waitUntil === "function") { got.waitUntil(safe); return true; }
  } catch { /* no request context here */ }
  return false;
}
