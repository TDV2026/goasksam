// THE BODY AUDIT (Lane B, Nov 6 2026): read the rows (live listings or archive sales), run each through the engine's own body rule (listingFacts: the title's word, else the stored field when the model came in it, else not stated), and count
// what the cross-check does. Pure: no read, no write. ops task=bodyaudit feeds it the rows; scripts/bodyTrustCheck.mjs feeds it a fixture.
import { listingFacts } from "./live/search.js";
import { knownBodiesFor } from "./modelBodies.js";
const OPEN = new Set(["convertible", "cabriolet", "roadster", "spyder", "spider", "speedster", "targa"]);
export function auditBodies(rows, { bodyOf = r => (r.body != null ? r.body : r.body_style), top = 40 } = {}) {
  const byBody = {}, models = new Map(), candidates = new Map();
  let total = 0, titleStated = 0, fieldOnly = 0, conflicts = 0, noBody = 0;
  const tally = (m, key, b) => { const e = m.get(key) || { model: key, n: 0, bodies: {} }; e.n++; e.bodies[b] = (e.bodies[b] || 0) + 1; m.set(key, e); };
  for (const r of rows) {
    total++;
    const f = listingFacts({ ...r, body: bodyOf(r) });
    if (f.bodyField === "title") { titleStated++; continue; }
    if (!f.bodyField) { noBody++; continue; }
    fieldOnly++;
    const b = f.bodyStored || "-", e = byBody[b] || (byBody[b] = { fieldOnly: 0, conflicts: 0 });
    e.fieldOnly++;
    const key = [r.make, r.model].filter(Boolean).join(" ") || "(no model)";
    if (f.bodyField === "conflict") { conflicts++; e.conflicts++; tally(models, key, b); }
    else if (OPEN.has(b) && !knownBodiesFor(r.make, r.model, r.year)) tally(candidates, key, b);
  }
  const ranked = m => [...m.values()].sort((a, b) => b.n - a.n).slice(0, top);
  return { rows: total, titleStatesBody: titleStated, storedFieldOnly: fieldOnly, conflicts, noBodyAtAll: noBody, byStoredBody: byBody, modelsWithMostConflicts: ranked(models), openBodiesOnModelsWithNoKnownBodies: ranked(candidates) };
}
