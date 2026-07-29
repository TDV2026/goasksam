// Specialization share metric. For platform P and scope S (landed rung: model,
// generation, or segment), over a 180-day window:
//   platform_share = P's sold count of S / P's total sold count
//   rest_share     = pooled other platforms' sold count of S / pooled other total
//   lift           = platform_share / rest_share
// A high lift means the platform is disproportionately WHERE this kind of car
// trades, even if another platform has more of them in absolute terms.
//
// Regenerated MONTHLY by scripts/refreshSpecializationShare.js from sales_archive
// (sold records already in Supabase; NO OldCarsData API calls, so it never
// touches the metered budget), reading the trailing 180 days. Same cadence and
// pattern as scripts/refreshReserveContext.js.
//
// PLATFORM-AGNOSTIC: `platform` is data on every row and every cell, never a
// literal in this module's logic.

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const plural = w => { const s = String(w || "").trim(); return /s$/i.test(s) ? s : `${s}s`; };

// Usable-cell gates (locked): the platform has 5+ sold of the scope in window
// AND lift >= 2.0. Below either, no cell exists.
export const SPECIALIZATION_MIN_COUNT = 5;
export const SPECIALIZATION_MIN_LIFT = 2.0;

// Scope-value key + human label for a row, at each rung. generationOf and
// segmentOf are injected (pure + testable): generationOf(make,model,year) ->
// { code, label } | null ; segmentOf(make,model) -> { key, label } | null.
export function scopeKeysForRow(row, { generationOf, segmentOf } = {}) {
  const make = String(row.make || "").trim();
  const model = String(row.model || "").trim();
  const out = [];
  if (make && model) {
    out.push({ rung: "model", scope: "model", key: `model|${norm(make)}|${norm(model)}`, label: plural(model) });
    const gen = generationOf && generationOf(make, model, Number(row.year));
    if (gen && gen.code) out.push({ rung: "generation", scope: "generation", key: `generation|${norm(make)}|${norm(model)}|${norm(gen.code)}`, label: `${String(gen.code).toUpperCase()}-generation ${plural(model)}` });
    const seg = segmentOf && segmentOf(make, model);
    if (seg && seg.key) out.push({ rung: "segment", scope: "segment", key: `segment|${norm(seg.key)}`, label: seg.label || plural(model) });
  }
  return out;
}

// Pure computation (unit-tested). rows: { platform, make, model, year, sale_price }.
// Every row is a SOLD record. Returns usable cells only.
export function computeSpecializationCells(rows, { dataMonth, generationOf, segmentOf } = {}) {
  const valid = (rows || []).filter(r => r && r.platform && r.make && r.model);
  const totalByPlatform = new Map();       // platform -> total sold count
  const scopeByPlatform = new Map();       // platform -> Map(scopeKey -> { count, label, scope, rung })
  const scopeTotals = new Map();           // scopeKey -> total sold count across ALL platforms
  let grandTotal = 0;

  for (const r of valid) {
    const p = r.platform;
    grandTotal += 1;
    totalByPlatform.set(p, (totalByPlatform.get(p) || 0) + 1);
    if (!scopeByPlatform.has(p)) scopeByPlatform.set(p, new Map());
    const pMap = scopeByPlatform.get(p);
    for (const s of scopeKeysForRow(r, { generationOf, segmentOf })) {
      if (!pMap.has(s.key)) pMap.set(s.key, { count: 0, label: s.label, scope: s.scope, rung: s.rung });
      pMap.get(s.key).count += 1;
      scopeTotals.set(s.key, (scopeTotals.get(s.key) || 0) + 1);
    }
  }

  const cells = [];
  for (const [platform, pMap] of scopeByPlatform.entries()) {
    const pTotal = totalByPlatform.get(platform) || 0;
    if (!pTotal) continue;
    const restTotal = grandTotal - pTotal;
    for (const [key, s] of pMap.entries()) {
      if (s.count < SPECIALIZATION_MIN_COUNT) continue;      // 5+ of the scope
      const restScope = (scopeTotals.get(key) || 0) - s.count;
      if (restTotal <= 0) continue;
      const platformShare = s.count / pTotal;
      const restShare = restScope / restTotal;
      if (restShare <= 0) continue;                          // no comparison base
      const lift = platformShare / restShare;
      if (lift < SPECIALIZATION_MIN_LIFT) continue;          // lift >= 2.0
      cells.push({
        platform,
        scope: s.scope,
        scope_key: key,
        scope_label: s.label,
        rung: s.rung,
        platform_count: s.count,
        lift_rounded: Math.round(lift),                       // nearest whole multiple, never decimals
        window: 180,
        data_month: dataMonth || null,
      });
    }
  }
  return cells;
}

// Regenerated monthly by scripts/refreshSpecializationShare.js. Empty until the
// first refresh runs.
export const SPECIALIZATION_CELLS = [];

// Request-time lookup: the cell for a platform at the request's landed scope.
// scopeQuery: { rung, make, model, generationCode, segmentKey }. Returns the
// cell or null. A generation query falls back to model scope so a specialist
// still surfaces when no generation cell exists.
export function findSpecializationContext(platform, scopeQuery, table = SPECIALIZATION_CELLS) {
  if (!platform || !scopeQuery) return null;
  const p = norm(platform);
  const make = norm(scopeQuery.make), model = norm(scopeQuery.model);
  const candidates = [];
  if (scopeQuery.rung === "segment" && scopeQuery.segmentKey) candidates.push(`segment|${norm(scopeQuery.segmentKey)}`);
  if (scopeQuery.generationCode && make && model) candidates.push(`generation|${make}|${model}|${norm(scopeQuery.generationCode)}`);
  if (make && model) candidates.push(`model|${make}|${model}`);
  for (const key of candidates) {
    const hit = (table || []).find(c => norm(c.platform) === p && c.scope_key === key);
    if (hit) return hit;
  }
  return null;
}
