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
const MONTHS6 = monthKeysBack(ANCHOR, 6);
const MONTHS3 = MONTHS6.slice(0, 3);
const LABEL3 = `${MONTHS3[2]}..${MONTHS3[0]}`;
const LABEL6 = `${MONTHS6[5]}..${MONTHS6[0]}`;
console.log(`Reserve-context refresh ending ${ANCHOR}: 3-month primary (${MONTHS3.join(", ")}) + 6-month fallback (${MONTHS6.join(", ")}); from sales_archive, no OCD calls.`);

const rowsByMonth = {};
for (const month of MONTHS6) {
  const acc = [];
  for (let offset = 0; offset < 50000; offset += 1000) {
    const batch = await supabaseSelect(env, `sales_archive?month=eq.${month}&select=platform,make,sale_price,has_reserve&limit=1000&offset=${offset}`);
    if (!batch || !batch.length) break;
    acc.push(...batch);
    if (batch.length < 1000) break;
  }
  rowsByMonth[month] = acc;
}
const rows3 = MONTHS3.flatMap(m => rowsByMonth[m] || []);
const rows6 = MONTHS6.flatMap(m => rowsByMonth[m] || []);
console.log(`  ${rows3.length} sold records across ${LABEL3} (3mo); ${rows6.length} across ${LABEL6} (6mo).`);
if (!rows6.length) { console.error("No records in the window; nothing written."); process.exit(1); }

const sortCells = a => a.sort((x, y) => x.platform.localeCompare(y.platform) || x.make.localeCompare(y.make) || x.band_low - y.band_low);
const cells3 = sortCells(computeReserveCells(rows3, LABEL3, "three months"));
const cells6 = sortCells(computeReserveCells(rows6, LABEL6, "six months"));
console.log(`  3mo: ${cells3.length} cell(s); 6mo: ${cells6.length} cell(s) (both sides >= 10).`);

const file = "lib/reserveContext.js";
let src = fs.readFileSync(file, "utf8");
const r3 = "export const RESERVE_CONTEXT = " + JSON.stringify(cells3, null, 2) + ";";
const r6 = "export const RESERVE_CONTEXT_6MO = " + JSON.stringify(cells6, null, 2) + ";";
const s2 = src.replace(/export const RESERVE_CONTEXT = [\s\S]*?\n\];/, r3);
if (s2 === src) { console.error("Could not find RESERVE_CONTEXT to replace."); process.exit(1); }
const s3 = s2.replace(/export const RESERVE_CONTEXT_6MO = [\s\S]*?\];/, r6);
if (s3 === s2) { console.error("Could not find RESERVE_CONTEXT_6MO to replace."); process.exit(1); }
fs.writeFileSync(file, s3);
console.log(`  Wrote 3mo(${cells3.length}) + 6mo(${cells6.length}) to ${file}. Commit + deploy to publish.`);
