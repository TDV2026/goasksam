// BODY SET-ASIDE COUNT (Lane B, Oct 20 2026, the read-only ops task=bodyaside; Lane F's fix after the 15:50 read). From the
// engine's own fetch with its set-aside rows kept (diag.excluded), the real sales of THIS car held back by reason: a row counts
// only when its OWN title names the typed body (the engine's body reader, the one the typed-body fence uses), its year is the
// typed year (when both are known), the reason is no photo, project or modified, and it passes every other fence once the
// photo rule is waived (never a different car). Before this fix, project and modified rows were counted for every body and
// year of the car (the engine returns those reasons before the body test). Pure: the engine functions are passed in.
export function heldBodyRows(excluded, spec, { body, year, rowBodyWordOf, bodyFamily, qualifyReason, rule = null }) {
  const fam = bodyFamily(String(body || "").toLowerCase());
  const held = new Map();
  for (const e of excluded || []) {
    const reason = String((e && e.reason) || "");
    if (!/^no photo$|^project or incomplete|modified/i.test(reason)) continue;
    const row = e.row || {};
    const b = rowBodyWordOf(row, rule);
    if (!b || bodyFamily(b) !== fam) continue;                                   // the row's own title names the typed body
    const ry = Number(row.year);
    if (Number.isFinite(Number(year)) && Number(year) > 0 && Number.isFinite(ry) && ry > 0 && ry !== Number(year)) continue;   // the typed year
    const r2 = qualifyReason(row, { ...spec, houseTier: true });
    if (r2 && !/^project or incomplete|modified/i.test(String(r2))) continue;   // a different car, a part, another fence
    const k = /^no photo$/i.test(reason) ? "no photo" : /^project/i.test(reason) ? "project" : "modified";
    if (!held.has(k)) held.set(k, new Set());
    held.get(k).add(String(row.id));
  }
  return Object.fromEntries([...held.entries()].map(([k, ids]) => [k, ids.size]));
}
