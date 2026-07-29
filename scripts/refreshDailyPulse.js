// Nightly Today's-Market refresh. Reads the two most recent COMPLETE trading
// days from sales_archive (each day must clear the 30-sale minimum, so a sparse
// ingest gap never forces a false quiet state), computes the three trend cards,
// and writes lib/dailyPulse.json. Zero OldCarsData calls; same credential
// pattern as the other refresh scripts. Scheduled nightly alongside the ingest:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/refreshDailyPulse.js
import fs from "node:fs";
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";
import { computeDailyPulse, PULSE_MIN_OVERALL } from "../lib/dailyPulse.js";

const env = supabaseEnv();
if (!env) { console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }

// 1) Find the two most recent days that each clear the overall minimum.
const dateRows = [];
for (let offset = 0; offset < 20000; offset += 1000) {
  const batch = await supabaseSelect(env, `sales_archive?select=sale_date&order=sale_date.desc&limit=1000&offset=${offset}`);
  if (!batch || !batch.length) break;
  dateRows.push(...batch);
  if (batch.length < 1000) break;
}
const counts = new Map();
for (const r of dateRows) { if (r.sale_date) counts.set(r.sale_date, (counts.get(r.sale_date) || 0) + 1); }
const denseDays = [...counts.entries()].filter(([, n]) => n >= PULSE_MIN_OVERALL).map(([d]) => d).sort().reverse();
console.log(`Daily-pulse refresh. Days with >= ${PULSE_MIN_OVERALL} sales (most recent first): ${denseDays.slice(0, 5).join(", ")}${denseDays.length > 5 ? " ..." : ""}`);

let pulse;
if (denseDays.length < 2) {
  console.log("  Fewer than two complete trading days; writing the quiet state.");
  pulse = computeDailyPulse([], [], denseDays[0] || new Date().toISOString().slice(0, 10));
} else {
  const [d1, d0] = [denseDays[0], denseDays[1]];
  const fetchDay = async date => {
    const rows = [];
    for (let offset = 0; offset < 10000; offset += 1000) {
      const batch = await supabaseSelect(env, `sales_archive?sale_date=eq.${date}&select=make,sale_price,bids:raw_record->stats->>bids&limit=1000&offset=${offset}`);
      if (!batch || !batch.length) break;
      rows.push(...batch);
      if (batch.length < 1000) break;
    }
    return rows;
  };
  const [yesterday, prior] = [await fetchDay(d1), await fetchDay(d0)];
  console.log(`  Comparing ${d1} (${yesterday.length} sales) vs ${d0} (${prior.length} sales).`);
  pulse = computeDailyPulse(yesterday, prior, d1);
}

for (const c of pulse.cards) console.log(`  ${c.title}: ${c.line}`);

fs.writeFileSync("lib/dailyPulse.json", JSON.stringify(pulse, null, 2) + "\n");
console.log(`\n  Wrote lib/dailyPulse.json (generated_date ${pulse.generated_date}). Commit + deploy to publish.`);
