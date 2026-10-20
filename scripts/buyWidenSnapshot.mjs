// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the protection-bypass header (Lane F's rule, Oct 20 2026).
// BUY WIDENINGS SNAPSHOT (Lane E, Oct 19 2026): the engine's widening chips (searchMeta.widen) for fixed filter sets,
// read through the no-model rerun path (POST /api/buySearch {action:"rerun"}), so a run before and a run after a change
// compare byte for byte. Live, read-only, zero OldCarsData, no model call. The probe key goes only in the x-ops-key
// header, never printed.
//   PROBE_KEY=... node scripts/buyWidenSnapshot.mjs --out before.json
//   PROBE_KEY=... node scripts/buyWidenSnapshot.mjs --out after.json --compare before.json
// Compare rule (Lane F, Oct 19 2026): for every set that had 0 to 2 live cars in BOTH runs with the same card ids, the
// widenings must be byte-identical; a set whose cars changed between the runs is reported "not comparable", never a pass.
import { readFileSync, writeFileSync } from "node:fs";
const arg = n => { const i = process.argv.indexOf("--" + n); if (i < 0) return null; const v = process.argv[i + 1]; return v == null || v.startsWith("--") ? "1" : v; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, ""), KEY = process.env.PROBE_KEY;
if (!KEY) { console.log("buyWidenSnapshot: no PROBE_KEY in the environment."); process.exit(2); }
const SETS = [
  { make: "BMW", model: "M3", year_min: 2011, year_max: 2011, body: "coupe" },
  { make: "Porsche", model: "911", trim: "GT3", year_min: 2023, year_max: 2023 },
  { make: "Porsche", model: "911", year_min: 2005, year_max: 2005, gearbox: "manual" },
  { make: "Ferrari", model: "F40" },
  { make: "Bugatti", model: "Type 57" },
  { make: "Ford", model: "Mustang", year_min: 1965, year_max: 1965, colour: "red" },
  { make: "Mercedes-Benz", model: "SL", year_min: 1963, year_max: 1963, gearbox: "manual" },
  { make: "Porsche", model: "911", colour: "black", gearbox: "manual" },
  { make: "Ford", model: "Mustang", year_min: 1965, year_max: 1966 },
];
const rows = [];
for (const f of SETS) {
  const t0 = Date.now();
  let j = null, status = 0;
  try { const r = await fetch(BASE + "/api/buySearch", { method: "POST", headers: { "Content-Type": "application/json", "x-ops-key": KEY, "x-launch-stage-test": "2" }, body: JSON.stringify({ action: "rerun", filters: f, turns: 1 }) }); status = r.status; j = await r.json().catch(() => null); } catch (e) { status = 0; }
  const meta = (j && j.meta) || {}, ids = ((j && j.cards) || []).map(c => c.id).sort((a, b) => a - b);
  const row = { key: JSON.stringify(f), status, ms: Date.now() - t0, live: meta.live ?? null, ids, widen: JSON.stringify(meta.widen ?? null) };
  rows.push(row);
  console.log(`${status} ${String(row.ms).padStart(6)} ms  live ${row.live}  widen ${row.widen.length > 160 ? row.widen.slice(0, 160) + "..." : row.widen}  ${row.key}`);
}
if (arg("out")) writeFileSync(arg("out"), JSON.stringify(rows, null, 1));
if (arg("compare")) {
  const before = new Map(JSON.parse(readFileSync(arg("compare"), "utf8")).map(r => [r.key, r]));
  let bad = 0, same = 0, nc = 0, big = 0;
  for (const a of rows) {
    const b = before.get(a.key); if (!b) continue;
    if (b.live > 2 && a.live > 2) { big++; console.log(`  LARGER SET (widen not shown): before ${b.live} cars, ${b.widen.length} bytes of widenings; after ${a.live} cars, ${a.widen}  ${a.key}`); continue; }
    if (JSON.stringify(a.ids) !== JSON.stringify(b.ids)) { nc++; console.log(`  NOT COMPARABLE (cars changed: before ${b.live}, after ${a.live})  ${a.key}`); continue; }
    if (a.widen === b.widen) { same++; console.log(`  SAME  ${a.key}`); } else { bad++; console.log(`  CHANGED  ${a.key}\n    before ${b.widen}\n    after  ${a.widen}`); }
  }
  console.log(`compare: ${same} same, ${bad} changed, ${nc} not comparable, ${big} larger sets`);
  process.exit(bad ? 1 : 0);
}
