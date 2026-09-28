// Enrichment-field fill rate across sales_archive (read-only, ZERO OldCarsData). For each source_slug:
// total sold rows + % with description / known_flaws / recent_service_history / modifications filled,
// and the same by model-year decade. EXACT counts (count=exact); this is a full-archive scan, so it
// runs as a script/workflow, not the interactive ops endpoint (which times out at 95 count queries).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/fieldCoverage.js
import { supabaseEnv } from "../lib/_supabase.js";

const env = supabaseEnv();
if (!env || !env.supabaseUrl || !env.supabaseKey) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }

const FIELDS = ["description", "known_flaws", "recent_service_history", "modifications"];
const SRC = ["bringatrailer", "carsandbids", "hagerty", "pcarmarket", "acc", "gooding", "rmsothebys", "hemmings", "sothebysmotorsport", "mbmarket", "autohunter", "barrettjackson", "mecum", "bonhams", "broadarrow", "carandclassic", "collectingcars", "themarket", "pistonheads"];
const DECADES = [[1950, 1969], [1970, 1989], [1990, 2009], [2010, 2099]];

async function countExact(filter) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/sales_archive?${filter}&limit=1`, {
    headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0", "Range-Unit": "items" }
  });
  const cr = r.headers.get("content-range") || ""; const m = cr.match(/\/(\d+)$/);
  return m ? Number(m[1]) : (r.ok ? 0 : null);
}
const pct = (n, d) => (d > 0 && n != null ? (Math.round((n / d) * 1000) / 10).toFixed(1) : "  -");

async function fillFor(base) {
  const total = await countExact(`${base}&select=id`);
  if (!total) return { total: total || 0 };
  const out = { total };
  for (const f of FIELDS) out[f] = await countExact(`${base}&${f}=not.is.null&select=id`);
  return out;
}

console.log("Field fill rate (% of SOLD rows with the field present), by source. Exact counts, zero OCD.\n");
console.log("source".padEnd(18) + "n".padStart(9) + "  desc".padStart(8) + "  flaws".padStart(8) + "   svc".padStart(8) + "  mods".padStart(8));
console.log("-".repeat(60));
for (const s of SRC) {
  const base = `source_slug=eq.${s}&sale_price=not.is.null`;
  const c = await fillFor(base);
  if (!c.total) { console.log(s.padEnd(18) + "0".padStart(9) + "   (no rows)"); continue; }
  console.log(s.padEnd(18) + String(c.total).padStart(9) + pct(c.description, c.total).padStart(8) + pct(c.known_flaws, c.total).padStart(8) + pct(c.recent_service_history, c.total).padStart(8) + pct(c.modifications, c.total).padStart(8));
}

console.log("\nBy model-year decade (all sources):");
console.log("decade".padEnd(14) + "n".padStart(9) + "  desc".padStart(8) + "  flaws".padStart(8) + "   svc".padStart(8) + "  mods".padStart(8));
console.log("-".repeat(56));
for (const [a, b] of DECADES) {
  const base = `year=gte.${a}&year=lte.${b}&sale_price=not.is.null`;
  const c = await fillFor(base);
  const label = `${a}-${String(b).slice(2)}`;
  if (!c.total) { console.log(label.padEnd(14) + "0".padStart(9)); continue; }
  console.log(label.padEnd(14) + String(c.total).padStart(9) + pct(c.description, c.total).padStart(8) + pct(c.known_flaws, c.total).padStart(8) + pct(c.recent_service_history, c.total).padStart(8) + pct(c.modifications, c.total).padStart(8));
}
console.log("\nDone.");
