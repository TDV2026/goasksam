// Monthly specialization-share refresh. Reads sales_archive (sold records
// already in Supabase; NO OldCarsData calls, so it never touches the metered
// budget) for the trailing 180 days, computes the specialization cells at model,
// generation and segment scope, and rewrites SPECIALIZATION_CELLS in
// lib/specializationShare.js. Same cadence/pattern as refreshReserveContext.js:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/refreshSpecializationShare.js [YYYY-MM]
import fs from "node:fs";
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";
import { computeSpecializationCells } from "../lib/specializationShare.js";
import { CURATED_GENERATIONS } from "../lib/generations.js";
import { MODEL_SEGMENTS } from "../lib/vehicleData.js";

const env = supabaseEnv();
if (!env) { console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const familyToken = m => norm(String(m || "").split(/\s+/)[0]);

// Sync scope mappers over the curated tables (offline; no DB round-trips).
const generationOf = (make, model, year) => {
  const y = Number(year); if (!Number.isFinite(y)) return null;
  const g = CURATED_GENERATIONS.find(row => norm(row.make) === norm(make) && familyToken(row.model) === familyToken(model) && y >= row.yearStart && y <= row.yearEnd);
  return g ? { code: g.code } : null;
};
const segmentOf = (make, model) => {
  const seg = MODEL_SEGMENTS.find(s => norm(s.make) === norm(make) && s.models.some(m => familyToken(m) === familyToken(model)));
  return seg ? { key: seg.key, label: seg.label } : null;
};

// Trailing 180 days == the last 6 complete month partitions (sales_archive is
// partitioned by `month` = YYYY-MM). Explicit arg overrides the anchor month.
function monthKeysBack(anchorMonth, n) {
  const [y, m] = anchorMonth.split("-").map(Number);
  const keys = [];
  const d = new Date(Date.UTC(y, m - 1, 1));
  for (let i = 0; i < n; i++) { keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`); d.setUTCMonth(d.getUTCMonth() - 1); }
  return keys;
}
function previousMonthKey() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const ANCHOR = process.argv[2] || previousMonthKey();
const MONTHS = monthKeysBack(ANCHOR, 6);
console.log(`Specialization refresh, trailing 180d ending ${ANCHOR} (months ${MONTHS.join(", ")}; from sales_archive, no OCD calls).`);

const rows = [];
for (const month of MONTHS) {
  for (let offset = 0; offset < 100000; offset += 1000) {
    const batch = await supabaseSelect(env, `sales_archive?month=eq.${month}&select=platform,make,model,year,sale_price&limit=1000&offset=${offset}`);
    if (!batch || !batch.length) break;
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
}
console.log(`  ${rows.length} sold records across the window.`);
if (!rows.length) { console.error("No records; nothing written."); process.exit(1); }

const cells = computeSpecializationCells(rows, { dataMonth: ANCHOR, generationOf, segmentOf })
  .sort((a, b) => b.lift_rounded - a.lift_rounded || b.platform_count - a.platform_count || a.platform.localeCompare(b.platform));
console.log(`  ${cells.length} usable cell(s) (5+ scope comps AND lift >= 2.0):`);
for (const c of cells) console.log(`    ${c.platform} | ${c.scope}:${c.scope_label} | n=${c.platform_count} lift=${c.lift_rounded}x`);

// Spread report: which platforms earned cells, and at which scopes.
const byPlatform = {};
for (const c of cells) { (byPlatform[c.platform] ||= []).push(`${c.scope_label} (${c.lift_rounded}x, n=${c.platform_count})`); }
console.log("\n  Specialization spread by platform:");
for (const [p, list] of Object.entries(byPlatform)) console.log(`    ${p}: ${list.join("; ")}`);

const file = "lib/specializationShare.js";
const src = fs.readFileSync(file, "utf8");
const rendered = "export const SPECIALIZATION_CELLS = " + JSON.stringify(cells, null, 2) + ";";
const next = src.replace(/export const SPECIALIZATION_CELLS = \[[\s\S]*?\];/, rendered);
if (next === src) { console.error("Could not find SPECIALIZATION_CELLS to replace."); process.exit(1); }
fs.writeFileSync(file, next);
console.log(`\n  Wrote ${cells.length} cell(s) to ${file}. Commit + deploy to publish.`);
