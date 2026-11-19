// THE BUILD SIDE OF THE PUBLIC EXAMPLES (Lane B, Nov 10 2026). A public request reads a stored pick (lib/live/publicAccess.js); THIS file is where the picks are made: the hourly cron (api/pullLive.js) and the keyed crew rebuild task (task=crewkeys&rebuild=entry) call
// refreshEntryExamples, one example at a time (the heavy-read rule), each under its own kill switch. A visitor's request never reaches this file. Zero OldCarsData; the reads are the archive and the engine's stored answers, as the crew builds always were.
import { FALLBACK_MAX_AGE_MS, FALLBACK_KEY, FALLBACK_V, refreshFindFallback, defaultDeps as findDeps } from "./findExamples.js";
import { refreshTasksEmailExample } from "./tasksDemo.js";
import { refreshMcExamples, refreshMcCard, refreshSellCard, refreshSellCars } from "./marketCheckExamples.js";
// the stored sales Find falls back on: kept while they are under a day old, else built again
export async function refreshFindSales(env, deps = {}) {
  if (process.env.FIND_EXAMPLES === "0") return { why: "off" };
  const d = { ...findDeps(), ...deps };
  try {
    const rows = await d.select(env, `app_config?key=eq.${FALLBACK_KEY}&select=value&limit=1`).catch(() => null), v = Array.isArray(rows) && rows[0] && rows[0].value;
    if (v && v.v === FALLBACK_V && Array.isArray(v.items) && Date.parse(v.builtAt) > d.now() - FALLBACK_MAX_AGE_MS) return { why: "kept" };
    const r = await refreshFindFallback(env, d);
    return { why: r.stored ? "built" : r.why || "none" };
  } catch { return { why: "error" }; }
}
export const ENTRY_REFRESHES = [["findSales", refreshFindSales], ["mcExamples", refreshMcExamples], ["mcCard", refreshMcCard], ["sellCard", refreshSellCard], ["sellCars", refreshSellCars], ["tasksEmail", refreshTasksEmailExample]];
// all of them, one at a time; a word each, never a car
export async function refreshEntryExamples(env, deps = {}, only = null) {
  const out = {};
  for (const [name, fn] of ENTRY_REFRESHES) { if (only && !only.includes(name)) continue; try { out[name] = (await fn(env, deps)).why || "done"; } catch { out[name] = "error"; } }
  return out;
}
