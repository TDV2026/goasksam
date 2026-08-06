// Monthly reserve-context refresh (Phase 1.5; window widened to rolling 3 months,
// Aug 2026). Reads sales_archive (sold records already in Supabase; NO OldCarsData
// calls, so it never touches the 33/day budget) over the last 3 COMPLETE calendar
// months, computes the reserve cells (10+ sold records on BOTH the reserve and
// no-reserve sides), and rewrites the RESERVE_CONTEXT array in lib/reserveContext.js.
// The 3-month window ~doubles cell coverage vs a single month; the 10/10 per-side
// gate is unchanged. Run monthly:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/refreshReserveContext.js [YYYY-MM anchor]
import fs from "node:fs";
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";
import { computeReserveCells } from "../lib/reserveContext.js";

const env = supabaseEnv();
if (!env) { console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }

// The last 3 COMPLETE calendar months ending at the anchor (default previous month).
function monthKeysBack(anchor, n) {
  const [y, m] = anchor.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, 1));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}
function previousMonthKey() {
  const d = new Date();
  d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const ANCHOR = process.argv[2] || previousMonthKey();
const MONTHS = monthKeysBack(ANCHOR, 3);
const WINDOW_LABEL = `${MONTHS[2]}..${MONTHS[0]}`;
console.log(`Reserve-context refresh, rolling 3 months ending ${ANCHOR} (${MONTHS.join(", ")}; from sales_archive, no OCD calls).`);

const rows = [];
for (const month of MONTHS) {
  for (let offset = 0; offset < 50000; offset += 1000) {
    const batch = await supabaseSelect(env, `sales_archive?month=eq.${month}&select=platform,make,sale_price,has_reserve&limit=1000&offset=${offset}`);
    if (!batch || !batch.length) break;
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
}
console.log(`  ${rows.length} sold records across ${WINDOW_LABEL}.`);
if (!rows.length) { console.error("No records for that window; nothing written."); process.exit(1); }

const cells = computeReserveCells(rows, WINDOW_LABEL).sort((a, b) =>
  a.platform.localeCompare(b.platform) || a.make.localeCompare(b.make) || a.band_low - b.band_low);
console.log(`  ${cells.length} usable cell(s) (both sides >= 10 sold records):`);
for (const c of cells) console.log(`    ${c.platform} | ${c.make} | ${c.band_key}: with=${c.avg_with_reserve} (n=${c.n_with}) vs without=${c.avg_no_reserve} (n=${c.n_without}) -> ${c.delta_dollars >= 0 ? "+" : ""}${c.delta_dollars} (${c.delta_pct}%)`);

const file = "lib/reserveContext.js";
const src = fs.readFileSync(file, "utf8");
const rendered = "export const RESERVE_CONTEXT = " + JSON.stringify(cells, null, 2) + ";";
const next = src.replace(/export const RESERVE_CONTEXT = [\s\S]*?\];/, rendered);
if (next === src) { console.error("Could not find RESERVE_CONTEXT to replace."); process.exit(1); }
fs.writeFileSync(file, next);
console.log(`  Wrote ${cells.length} cell(s) to ${file}. Commit + deploy to publish.`);
