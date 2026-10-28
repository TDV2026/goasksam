// MARK STALE, NEVER DELETE (Oct 28 2026). When ingest lands new sales for a make and model, every stored Find, Buy and Tasks core row (spec_market_cache, key a JSON array
// [make, model, ..., generation code]) for it is MARKED stale (market.staleSince, an ISO time) and kept. A marked row is served at once as the answer and refreshed behind the response
// (lib/live/search.js specCore); the refresh writes a fresh row, which carries no mark. Nothing is deleted. A row without the mark is fresh exactly as before, so rows stored under the
// live stamp survive unchanged. Ingest is still the only writer of the sales epoch.
import { supabaseSelect, supabaseSelectAll, supabasePatch } from "./_supabase.js";

export function touchedSetOf(rows) {
  return new Set((rows || []).map(r => `${String(r.make || "").toLowerCase()}|${String(r.model || "").toLowerCase()}`).filter(k => k !== "|"));
}
// the keys of a JSON-array spec key that a touched make and model (or generation code) reaches; any other key (MCWARM:, LIVESPECS:, QELIG) is not a core row and is never touched here
export function keyIsTouched(specKey, touched) {
  let parsed; try { parsed = JSON.parse(specKey); } catch { return false; }
  const [mk, md, , gc] = Array.isArray(parsed) ? parsed : [];
  const mkL = String(mk || "").toLowerCase(); if (!mkL) return false;
  return touched.has(`${mkL}|${String(md || "").toLowerCase()}`) || !!(gc && touched.has(`${mkL}|${String(gc).toLowerCase()}`));
}
export async function markTouchedStale(env, touched, nowIso = new Date().toISOString()) {
  const cacheRows = (await supabaseSelectAll(env, "spec_market_cache?select=spec_key")) || [];
  const keys = cacheRows.map(r => r.spec_key).filter(k => keyIsTouched(k, touched));
  let marked = 0, already = 0, failed = 0;
  for (let i = 0; i < keys.length; i += 20) {
    const part = keys.slice(i, i + 20), list = part.map(s => `"${s.replace(/"/g, '\\"')}"`).join(",");
    const rows = await supabaseSelect(env, `spec_market_cache?spec_key=in.(${encodeURIComponent(list)})&select=spec_key,market`);
    if (!Array.isArray(rows)) { failed += part.length; continue; }
    await Promise.all(rows.map(async r => {
      if (!r.market || typeof r.market !== "object") { failed++; return; }
      if (r.market.staleSince) { already++; return; }
      const res = await supabasePatch(env, `spec_market_cache?spec_key=eq.${encodeURIComponent(r.spec_key)}`, { market: { ...r.market, staleSince: nowIso } });
      if (res && res.ok) marked++; else failed++;
    }));
  }
  return { keys, marked, already, failed, deleted: 0 };
}
