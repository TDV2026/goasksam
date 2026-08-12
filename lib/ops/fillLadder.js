// Fill-ladder CORE, shared by the CLI (scripts/fillLadder.js) and the web trigger
// (api/usageDashboard.js ?view=ops&task=fill). Warms the market-fetch cache by
// calling the LIVE engine (warm:true) once per nameplate, so it reuses the exact
// fetch + persist + cache-stamp path and is gated to the RESERVED warm fraction of
// the daily OCD budget (a real seller search always outranks it). The caller owns
// the nameplate list, the cursor store and any output; this module runs one bounded
// batch and reports where it stopped.

// Run one batch. Options:
//   base        engine origin (e.g. https://goasksam.com)
//   list        array of [make, model] nameplates
//   startIndex  resume position (default 0)
//   limit       max nameplates this batch (default Infinity; the web trigger caps it)
//   log         progress callback (default noop)
// Returns { processed, spent, degraded, nextIndex, done, budgetStopped, lastNameplate }.
export async function runFillBatch({ base, list, startIndex = 0, limit = Infinity, log = () => {} } = {}) {
  if (!base) throw new Error("runFillBatch needs an engine base URL.");
  if (!Array.isArray(list) || !list.length) throw new Error("runFillBatch needs a non-empty nameplate list.");
  let processed = 0, spent = 0, degraded = 0, budgetStopped = false, i = startIndex, lastNameplate = null;
  for (; i < list.length && processed < limit; i++) {
    const [make, model] = list[i];
    const vehicle = { raw: `${make} ${model}`, make, model, confidence: "high" };
    let reqSpent = 0, stop = "";
    try {
      const res = await fetch(`${base}/api/sellerDecision`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warm: true, car: { vehicle, region: "US" } })
      });
      const j = await res.json().catch(() => ({}));
      const fs2 = j.evidence?.fetchStrategy || {};
      reqSpent = Number(fs2.meteredRequests || 0);
      stop = String(fs2.stopReason || "");
    } catch (e) {
      log(`${make} ${model}: request error ${e.message}`);
    }
    spent += reqSpent; processed++; lastNameplate = `${make} ${model}`;
    if (/budget/.test(stop)) degraded++;
    log(`[${i + 1}/${list.length}] ${make} ${model} (+${reqSpent} req, batch spend ${spent})`);
    // The engine soft-degrades to the store once the reserved warm budget is spent;
    // a degraded response means the day's warm budget is gone - stop and resume later
    // rather than hammering the store for no new coverage. i+1 is the resume point.
    if (/budget/.test(stop)) { budgetStopped = true; i++; break; }
  }
  const nextIndex = i;
  return { processed, spent, degraded, nextIndex, done: nextIndex >= list.length, budgetStopped, lastNameplate };
}
