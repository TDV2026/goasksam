// Shared recompute-one-spec helper (Oct 2026, nightly timing follow-up). Used by scripts/ingest.js
// (inline, capped) and scripts/recomputeSpecCache.js (the deferred, out-of-critical-path job) so
// there is exactly one implementation of "turn an invalidated spec_key back into a fresh
// spec_market_cache row" - the SAME engine call (runOneBox) and the SAME write path
// (coreOf/persistCore) api/sellerDecision.js's opportunistic refresh already uses.
// A spec key read back into the car and the refine it names (Lane B, Nov 5 2026, nightly #132 item 4 sweep). The key is written by specKeyFor (lib/live/search.js) as
//   [make, model, trim, year, genCode, bodyStyle, edition, variant, wheelbase, tx, refine.body, refine.trim + "|pool2", refine.variant, ...("mi:", "yr:", "ct:", "attrs:" and the extras)]
// recomputeOneSpecKey read it as [make, model, trim, genCode, bodyStyle, gearbox], the layout from before the year joined the key, so every position after the trim was one off: the
// generation code was read as the year, the generation as the body, the body as the GEARBOX. A recomputed row was therefore computed for a different car than its key names (no year, a body of
// "C2", a gearbox of "convertible") and written under the right key. Refines the key carries that the old read never knew (mileage, year, tier, attributes, the extras) are not rebuilt here:
// such a key is left for its next real read, never written from a guess.
export function parseSpecKey(key) {
  let p; try { p = JSON.parse(key); } catch { return null; }
  if (!Array.isArray(p)) return null;
  const [make, model, trim, year, genCode, bodyStyle, edition, variant, wheelbase, tx, rbody, rtrim, rvariant, ...rest] = p;
  if (!make || !model) return null;
  const extra = rest.filter(x => x != null);
  const refine = {};
  if (tx) { refine.tx = tx; refine.label = tx; }
  if (rbody) refine.body = rbody;
  if (rtrim) refine.trim = String(rtrim).replace(/\|pool2$/, "");
  if (rvariant) refine.variant = rvariant;
  return { vehicle: { make, model, trim: trim || null, year: Number(year) > 0 ? Number(year) : null, bodyStyle: bodyStyle || null, edition: edition || null, variant: variant || null, wheelbase: wheelbase || null }, genCode: genCode || null, refine: Object.keys(refine).length ? refine : null, unsupported: extra.length > 0 };
}
export async function recomputeOneSpecKey(env, key) {
  const { runOneBox } = await import("./onebox.js");
  const { CURATED_GENERATIONS } = await import("./generations.js");
  const { coreOf, persistCore } = await import("./live/search.js");
  try {
    const parsed = parseSpecKey(key);
    if (!parsed) return "failed";
    if (parsed.unsupported) return "thin";   // a mileage, year, tier or attribute refine: rebuilt by its next real read, not guessed here
    const { vehicle: v0, genCode, refine } = parsed;
    const generation = genCode ? CURATED_GENERATIONS.find(g => String(g.make).toLowerCase() === String(v0.make).toLowerCase() && String(g.code).toLowerCase() === String(genCode).toLowerCase()) || null : null;
    const vehicle = { ...v0, year: v0.year || (generation ? Math.round((generation.yearStart + generation.yearEnd) / 2) : null) };
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

// ---- BACKLOG (Nov 5 2026) ----
// Tonight's invalidated keys, merged with whatever earlier nights left unfinished (app_config spec_recompute_backlog), de-duplicated,
// tonight's first only for ties (ranking decides the order). A key whose cache row already exists again is dropped: a real read rebuilt it.
export const BACKLOG_KEY = "spec_recompute_backlog";
export function mergeBacklog(tonight, backlog, alreadyRebuilt = new Set()) {
  const seen = new Set(), out = [];
  for (const k of [...(Array.isArray(tonight) ? tonight : []), ...(Array.isArray(backlog) ? backlog : [])]) {
    if (typeof k !== "string" || !k || seen.has(k) || alreadyRebuilt.has(k)) continue;
    seen.add(k); out.push(k);
  }
  return out;
}
// What this run does and what it leaves: at most `cap` keys, and none started after the time budget is spent. Everything not done is the new backlog.
export function planRun(ranked, { cap, budgetMs, startedAt, now = Date.now }) {
  const done = [], left = [];
  for (const k of ranked) {
    if (done.length >= cap || now() - startedAt >= budgetMs) left.push(k); else done.push(k);
  }
  return { done, left };
}
