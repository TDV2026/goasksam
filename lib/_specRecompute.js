// Shared recompute-one-spec helper (Oct 2026, nightly timing follow-up). Used by scripts/ingest.js
// (inline, capped) and scripts/recomputeSpecCache.js (the deferred, out-of-critical-path job) so
// there is exactly one implementation of "turn an invalidated spec_key back into a fresh
// spec_market_cache row" - the SAME engine call (runOneBox) and the SAME write path
// (coreOf/persistCore) api/sellerDecision.js's opportunistic refresh already uses.
export async function recomputeOneSpecKey(env, key) {
  const { runOneBox } = await import("./onebox.js");
  const { CURATED_GENERATIONS } = await import("./generations.js");
  const { coreOf, persistCore } = await import("./live/search.js");
  try {
    const parsed = JSON.parse(key);
    const [make, model, trim, genCode, bodyStyle, gearbox] = Array.isArray(parsed) ? parsed : [];
    if (!make || !model) return "failed";
    const yearMatch = /^y(\d{4})$/.exec(String(genCode || ""));
    const year = yearMatch ? Number(yearMatch[1]) : null;
    const generation = (!yearMatch && genCode)
      ? CURATED_GENERATIONS.find(g => String(g.make).toLowerCase() === String(make).toLowerCase() && String(g.code).toLowerCase() === String(genCode).toLowerCase()) || null
      : null;
    const vehicle = { make, model, trim: trim || null, bodyStyle: bodyStyle || null, year: year || (generation ? Math.round((generation.yearStart + generation.yearEnd) / 2) : null) };
    const refine = gearbox ? { tx: gearbox, label: gearbox } : null;
    const searchText = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
    const d = await runOneBox(vehicle, generation, searchText, env, refine);
    if (d && d.tier === "result") {
      const core = coreOf(d, { v: vehicle, generation, refine });
      if (core) { await persistCore(env, key, core); return "recomputed"; }
    }
    return "thin";   // not an error - a genuinely thin/no-range spec; next real read handles it the same as today
  } catch {
    return "failed";
  }
}

// Ranks spec_keys by real search volume (app_usage_events seller_search text), the SAME signal
// scripts/warm.js already uses for its own nightly priority list - one ranking source, not a
// second invented one. A spec_key whose make or model never appears in the recent search log
// sorts last (count 0), never dropped - the cap below decides what gets left for the next read.
export async function rankSpecKeysByViews(env, keys, supabaseSelect) {
  let rows = null;
  try { rows = await supabaseSelect(env, "app_usage_events?event_type=eq.seller_search&search_text=not.is.null&select=search_text&order=created_at.desc&limit=5000"); } catch { rows = null; }
  const text = (rows || []).map(r => String(r.search_text || "").toLowerCase()).join(" \n ");
  const scored = keys.map(key => {
    let make = "", model = "";
    try { const p = JSON.parse(key); [make, model] = Array.isArray(p) ? p : []; } catch { /* unparseable sorts last */ }
    const mk = String(make || "").toLowerCase(), md = String(model || "").toLowerCase();
    let score = 0;
    if (mk) score += (text.match(new RegExp(mk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    if (md) score += (text.match(new RegExp(md.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length * 2;   // model match is a stronger signal than make alone
    return { key, score };
  });
  return scored.sort((a, b) => b.score - a.score).map(s => s.key);
}
